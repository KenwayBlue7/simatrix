// main.js — orchestrator for Projection of Points, built on the shared engine
// (src/engine.js) in dual-window mode: two independent renderer stacks (S3 = always
// 3D, S2 = always 2D), the 2D Picture-in-Picture + 3D/2D toggle bar, and the
// reversible HP fold. All generic machinery — renderer stacks, JS-owned canvas
// sizing, the guided stepper, term popovers, the fold timeline driver, simAPI, and the
// boot watchdog — lives in the engine. This file supplies only the lesson's pure data
// layer (src/pointData.js + src/steps.js), the two draw functions, the fold scene, and
// the lesson-specific control wiring, then calls initSim({ mode:'dual', … }).
//
// World axes (engineering-correct — both planes share the X-axis fold line):
//   HP = XZ plane (y=0)   VP = XY plane (z=0)   fold line = X-axis
//   lateral distRP → X · height distHP → Y · depth distVP → Z (in front of VP = +Z)
// resolvePosition() returns signed mm; resolve() scales to world units, and draw3D
// remaps q = (distRP, distHP, distVP) so distVP becomes the depth axis (+Z).
import * as THREE from 'three';
import { initSim, alp, asg, asp, acr, adm, alb, albBox, toW, foldStateAt, setRange, gridM2, planeSheet, flowNote, announce } from './src/engine.js';
import { defaultPointData, resolvePosition } from './src/pointData.js';
import { STEPS, TERMS } from './src/steps.js';
import { PROBLEMS, TIERS, FIELD_LABELS } from './src/pointProblems.js';

const $ = id => document.getElementById(id);

// ── Resolve: signed mm → world point + world distances ────────
// model.p  = signed world coordinates of P (toW of resolvePosition)
// model.wd = world-unit HP/VP/PP distances + quadrant (draw2D plots on these)
function resolve(d){
  const pos = resolvePosition(d);
  return {
    p:  { x:toW(pos.x), y:toW(pos.y), z:toW(pos.z) },
    wd: { distHP:toW(d.distHP), distVP:toW(d.distVP), distRP:toW(d.distRP), quadrant:d.quadrant },
  };
}

// ── 3D scene ──────────────────────────────────────────────────
// Two-cue rule: everything HP is teal + SOLID; everything VP is amber + DASHED.
// ctx = { model, raw, view, COL }. q remaps model.p to (lateral, height, depth).
function draw3D(g, ctx){
  const { model, raw, view, COL } = ctx;
  const v = view, GRID = 40, HALF = GRID/2;   // GRID: bounded 40×40 sheet (400 mm, 10 mm cells) so a typed 200 mm point never bleeds; HALF: full-width fold line + X/Y ends
  const q = { x:model.p.z, y:model.p.y, z:model.p.x };          // remap to (lateral, height, depth)

  // Bounded "sheet of paper": faint translucent fill + thick plane-hued border, with the
  // Module-2 grey graph-paper grid (10 mm cells) layered on top — HP floor (XZ) + VP wall (XY).
  planeSheet(g,GRID,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0),COL.hp);   // HP sheet fill + teal border
  planeSheet(g,GRID,COL.vp,.07,null,COL.vp);                              // VP sheet fill + amber border
  const hpG=gridM2(GRID,GRID); g.add(hpG);                             // HP floor (XZ, y=0), 20 divisions
  const vpG=gridM2(GRID,GRID); vpG.rotation.x=Math.PI/2; g.add(vpG);   // VP wall  (XY, z=0), 20 divisions
  asg(g,[-HALF,0,0],[HALF,0,0],COL.ink,0);                      // fold line (X-axis) — spans the full sheet width
  // Plane names + axis ends as camera-facing billboard labels (alb), matching Module 2 / Lines.
  alb(g,'HP',-8,-.3,8,COL.hp,2.0,.78);
  alb(g,'VP',-8,8,.05,COL.vp,2.0,.78);
  // x / y at the two ENDS of the fold line (matches the 2D x|y convention).
  alb(g,'x',-HALF-.35,.35,0,COL.ink,1.0,.5);
  alb(g,'y', HALF+.35,.35,0,COL.ink,1.0,.5);

  if(!v.showPoint) return;
  asp(g,q.x,q.y,q.z,.12,COL.ink,{halo:false}); albBox(g,'P',q.x+.32,q.y+.37,q.z+.2,COL.ink,.3);

  // Connector toggle (viewport chip): hide the dashed projectors + foot connectors for a
  // de-cluttered read, keeping the foot dots + labels. Default-true → no change unless toggled.
  const conn = v.connectors !== false;
  if(v.showHP){
    if(conn){
      asg(g,[q.x,q.y,q.z],[q.x,0,q.z],COL.hp,1);                // HP projector P→foot (dashed)
      asg(g,[q.x,0,q.z],[q.x,0,0],COL.hp,0);                    // foot→fold line (in HP plane)
    }
    acr(g,q.x,0,q.z,.14,COL.hp,true); albBox(g,'p',q.x+.3,.24,q.z,COL.hp,.3);
  }
  if(v.showVP){
    if(conn){
      asg(g,[q.x,q.y,q.z],[q.x,q.y,0],COL.vp,1);                // VP projector P→foot (dashed)
      asg(g,[q.x,q.y,0],[q.x,0,0],COL.vp,1);                    // foot→fold line (in VP plane)
    }
    acr(g,q.x,q.y,0,.14,COL.vp,false); albBox(g,"p'",q.x+.26,q.y+.3,.06,COL.vp,.3);  // foot dot lies IN the VP (z=0 plane), not poking out along Z
  }
  if(v.showCoord){
    const s=n=>n<0?'−':'', f=n=>Math.abs(n).toFixed(0);
    alb(g,`P(${s(model.p.x)}${f(raw.distVP)}, ${s(model.p.y)}${f(raw.distHP)}, ${s(model.p.z)}${f(raw.distRP)})`,
        q.x+.4,q.y+.7,q.z+.3,COL.ink,2.8,.36,true);
  }
}

// ── 2D scene ──────────────────────────────────────────────────
// Only meaningful once both views exist; before that, show an empty-state. Geometry
// uses the world distances (model.wd); dimension labels use the mm values (raw).
function draw2D(g, ctx){
  const { model, raw, view, COL } = ctx;
  const d = model.wd, r = raw, v = view;
  const hw=6.5,hh=5.5;
  alp(g,[[-hw,-hh,0],[hw,-hh,0],[hw,hh,0],[-hw,hh,0]],COL.border);
  asg(g,[-hw,0,0],[hw,0,0],COL.ink,0);
  alb(g,'x',-hw+.55,.38,0,COL.ink,.85,.72,false,128); alb(g,'y',hw-.55,.38,0,COL.ink,.85,.72,false,128);
  alb(g,'VP',-hw+1.1,2.8,0,COL.vp,1.6,.92,false,128); alb(g,'HP',-hw+1.1,-2.8,0,COL.hp,1.6,.92,false,128);

  if(!(v.showHP && v.showVP)){
    alb(g,'Top & front views appear here',0,0,0,COL.bench,4.4,.42);
    return;
  }

  const signLat=(r.quadrant==='Q2'||r.quadrant==='Q3')?-1:1, lx=signLat*d.distRP;
  const elevSign=(r.quadrant==='Q1'||r.quadrant==='Q2')?1:-1, ey=elevSign*d.distHP;  // p' (front view, VP)
  const planSign=(r.quadrant==='Q2'||r.quadrant==='Q3')?1:-1, py=planSign*d.distVP;  // p  (top view, HP)
  const conn = v.connectors !== false;   // connector toggle gates the dashed projectors

  if(conn) asg(g,[lx,ey,0],[lx,0,0],COL.vp,0);                 // VP projector (solid amber — Type B thin)
  acr(g,lx,ey,0,.18,COL.vp,false); albBox(g,"p'",lx+.6,ey+.5,0,COL.vp,.6);
  adm(g,lx,0,lx,ey,COL.vp,`${r.distHP.toFixed(0)} mm`);

  if(conn) asg(g,[lx,0,0],[lx,py,0],COL.hp,0);                 // HP projector (solid teal — Type B thin)
  acr(g,lx,py,0,.18,COL.hp,false); albBox(g,'p',lx+.6,py-.5,0,COL.hp,.6);
  adm(g,lx,0,lx,py,COL.hp,`${r.distVP.toFixed(0)} mm`);
}

// ── Fold scene (reversible rabatment) ─────────────────────────
// The engine hands us the freshly-cleared S3 group + ctx and runs our returned
// apply(p) on its timeline. Only hpGroup rotates about the X hinge; the 3D depth cues
// (P, its label, the two perpendicular projectors) fade out over the last stretch.
// The camera is never touched — the engine's timeline driver guarantees that.
function buildAnimScene(g, ctx){
  const { model, COL } = ctx;
  const GRID = 40, HALF = GRID/2;                               // matches draw3D (400 mm sheet)
  const ax=model.p.z, ay=model.p.y, az=model.p.x;              // remap lateral, height, depth
  const last=()=>g.children[g.children.length-1];
  const fade=[];

  // VP — XY plane (z=0), stationary. Bounded sheet (fill + amber border) + grey grid +
  // flat label (matches draw3D → no jump).
  planeSheet(g,GRID,COL.vp,.07,null,COL.vp);
  const vpG=gridM2(GRID,GRID); vpG.rotation.x=Math.PI/2; g.add(vpG);
  alb(g,'VP',-8,8,.05,COL.vp,2.0,.78);
  asg(g,[-HALF,0,0],[HALF,0,0],COL.ink,0);                     // fold line (hinge) — full sheet width, matches draw3D

  // p′ on VP (stays in z=0): connector, dot, label — KEEP
  asg(g,[ax,ay,0],[ax,0,0],COL.vp,1);
  acr(g,ax,ay,0,.14,COL.vp,false);   // foot dot lies IN the VP (z=0 plane)
  albBox(g,"p'",ax+.26,ay+.3,.06,COL.vp,.3);

  // Depth cues — FADE: P, its label, VP projector P→p′
  asp(g,ax,ay,az,.12,COL.ink,{halo:false});    fade.push(last());
  albBox(g,'P',ax+.32,ay+.37,az+.2,COL.ink,.3);  fade.push(last());
  asg(g,[ax,ay,az],[ax,ay,0],COL.vp,1);         fade.push(last());

  // hpGroup — the ONLY thing that rotates (about the X hinge)
  const hpGroup=new THREE.Group(); g.add(hpGroup); hpGroup.rotation.set(0,0,0);
  planeSheet(hpGroup,GRID,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0),COL.hp);  // HP sheet (fill + teal border) folds with the grid
  hpGroup.add(gridM2(GRID,GRID));                                              // grey HP grid folds with the sheet
  alb(hpGroup,'HP',-8,-.3,8,COL.hp,2.0,.78);  // billboard label rides the fold (faces camera)
  acr(hpGroup,ax,0,az,.14,COL.hp,true);
  albBox(hpGroup,'p',ax+.3,.24,az,COL.hp,.3);
  asg(hpGroup,[ax,0,az],[ax,0,0],COL.hp,0);                    // foot → fold line (in HP)

  // HP projector P→foot (dynamic, follows the moving foot) — FADE
  const projGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax,ay,az),new THREE.Vector3(ax,0,az)]);
  const dynProj=new THREE.Line(projGeo,new THREE.LineDashedMaterial({color:new THREE.Color(COL.hp),dashSize:.18,gapSize:.10}));
  dynProj.computeLineDistances(); g.add(dynProj); fade.push(dynProj);
  const footTracker=new THREE.Object3D(); footTracker.position.set(ax,0,az); hpGroup.add(footTracker);

  for(const o of fade){ if(o.material) o.material.transparent=true; }

  const tmpV=new THREE.Vector3(), P=[ax,ay,az];
  const apply=p=>{
    const { rot, op }=foldStateAt(p);
    hpGroup.rotation.x=rot;
    for(const o of fade){ if(o.material) o.material.opacity=op; else if(o.element) o.element.style.opacity=op; }
    footTracker.getWorldPosition(tmpV);
    projGeo.setFromPoints([new THREE.Vector3(...P), tmpV.clone()]);
    dynProj.computeLineDistances();
  };
  return { apply };
}

// ── Slider + quadrant-select sync (afterRebuild) ──────────────
function sync(d){
  setRange('r-hp','n-hp',d.distHP,v=>`${v} millimetres from HP`,'mm');
  setRange('r-vp','n-vp',d.distVP,v=>`${v} millimetres from VP`,'mm');
  setRange('r-pp','n-pp',d.distRP,v=>`${v} millimetres from the profile plane`,'mm');
  const sel=$('sel-q'); if(sel) sel.value=d.quadrant;
}

// ── Lesson-specific control wiring (HP / VP / PP sliders + quadrant select) ─
function wireControls({ editRebuild, getData, setNote, exitQuickView }){
  // A parameter edit makes any active orthographic quick-view stale, so ease the camera back to
  // the 3D orbit first (no-op when none is lit), then rebuild — matching the Lines sim. editRebuild
  // (not plain rebuild) keeps the downstream projections live when editing an early step and surfaces
  // the "Unfolded to 3D…" note if the sheet was folded flat.
  const edit = d => { exitQuickView?.(); editRebuild(d); };
  [['r-hp','n-hp','distHP'],['r-vp','n-vp','distVP'],['r-pp','n-pp','distRP']].forEach(([r,n,k])=>{
    $(r).addEventListener('input',()=>edit({ ...getData(), [k]:+$(r).value||0 }));
    $(n).addEventListener('change',()=>{
      const v=parseFloat($(n).value), note='note-'+r.slice(2);
      if(!isFinite(v)||v<0){                            // invalid: revert to the last value + say so
        const kept=getData()[k]; sync(getData()); setNote(note,'');
        flowNote(`Kept ${kept} mm`); announce(`Kept your last value, ${kept} millimetres.`);
      } else if(v>200){                                 // clamp: accept the cap, but say so
        edit({ ...getData(), [k]:200 }); setNote(note,'The maximum is 200 mm, so 200 mm is used.');
      } else {
        edit({ ...getData(), [k]:v });
      }
    });
  });
  $('sel-q').addEventListener('change',()=>edit({ ...getData(), quadrant:$('sel-q').value }));
}

// ── Screen-reader mirror of the viewport result ───────────────
const QNAME={Q1:'one',Q2:'two',Q3:'three',Q4:'four'};
function describe(d,v){
  if(!v.showPoint) return '';
  const q=d.quadrant, aboveHP=(q==='Q1'||q==='Q2'), frontVP=(q==='Q1'||q==='Q4');
  const s=[];
  if(v.showQuad) s.push(`Quadrant ${QNAME[q]}.`);
  const loc=[];
  if(v.showHP) loc.push(`${d.distHP} millimetres ${aboveHP?'above':'below'} the horizontal plane`);
  if(v.showVP) loc.push(`${d.distVP} millimetres ${frontVP?'in front of':'behind'} the vertical plane`);
  if(d.distRP>0) loc.push(`${d.distRP} millimetres from the profile plane`);
  if(loc.length) s.push(`Point P is ${loc.join(', ')}.`);
  if(v.showHP && v.showVP){
    const epAbove=(q==='Q1'||q==='Q2');   // front view p′ vs XY (matches draw2D elevSign)
    const pAbove=(q==='Q2'||q==='Q3');     // top view p  vs XY (matches draw2D planSign)
    s.push(`In the drawing, front view p-prime is ${d.distHP} millimetres ${epAbove?'above':'below'} the XY line; top view p is ${d.distVP} millimetres ${pAbove?'above':'below'} it.`);
  }
  return s.join(' ');
}

// ── Start the lesson ──────────────────────────────────────────
initSim({
  mode:'dual', chap:'points', steps:STEPS, terms:TERMS,
  defaultData: defaultPointData,
  resolve,
  defaultView:{ showPoint:false, showHP:false, showVP:false, showCoord:false, showQuad:false, showDrawing:false },
  // 3D framing: a 3/4 view from the TOP-LEFT-front (−X = left in the front view), looking at the
  // origin region, FOV 45 (engine default). Note: this pose sits above HP, so the lower quadrants
  // (Q3/Q4, below HP) sit a little lower in the frame; the geometric origin / fold hinge stays at
  // world 0. Quick-view/fold poses are shared.
  // Pulled back to ~dist 30 to suit the enlarged 40×40 (400 mm) sheets; auto-zoom (autoFrame)
  // dollies further out on demand when a typed 200 mm point grows the geometry.
  cam3:{ p:new THREE.Vector3(-19, 15, 19), t:new THREE.Vector3(0, 1.5, 0) },
  draw3D, draw2D, buildAnimScene, describe,
  // Module-2 camera orchestrator: clip-aware auto-zoom + orthographic quick-views with a
  // perspective↔ortho morph + flattened 2D pans. contentBox feeds the auto-zoom + ortho-fit the
  // MEANINGFUL geometry (P + its feet, ignoring the big grid); flatViewBox locates each view's
  // region on the folded z=0 sheet for the 2D pans.
  autoFrame:true, orthoViews:true,
  // Nudge the P / p / p′ name chips outward off the linework (Module-2 vertexLabeler technique).
  declutterLabels:true,
  contentBox: m => {
    const q={ x:m.p.z, y:m.p.y, z:m.p.x };               // world remap (lateral, height, depth)
    const b=new THREE.Box3().setFromPoints([
      new THREE.Vector3(q.x,q.y,q.z), new THREE.Vector3(q.x,0,q.z),   // P + HP foot p
      new THREE.Vector3(q.x,q.y,0),   new THREE.Vector3(0,0,0),       // VP foot p′ + origin
    ]);
    return b.expandByScalar(0.5);                        // hug the point + feet TIGHT (small margin: enough to de-degenerate when distRP=0 + keep the P/p/p′ labels off the frame edge, but no further — opens close to the subject); auto-zoom centres + pushes back from here
  },
  flatViewBox: (kind,m) => {
    const q={ x:m.p.z, y:m.p.y, z:m.p.x };
    const Fp=new THREE.Vector3(q.x,q.y,0);               // p′ front view (above XY)
    const Tp=new THREE.Vector3(q.x,-q.z,0);             // p top view (below XY, post +90° fold)
    const O=new THREE.Vector3(q.x,0,0), Z=new THREE.Vector3(0,0,0);
    const pts = kind==='front' ? [Fp,O,Z] : kind==='top' ? [Tp,O,Z] : [Fp,Tp,Z];
    const b=new THREE.Box3().setFromPoints(pts).expandByScalar(2.5); b.min.z=0; b.max.z=0; return b;
  },
  // Premium viewport chrome: quick-view chips, the connector declutter toggle, and the
  // first-angle badge during the fold. The Compare chip appears once both views exist.
  ui:{ faSymbol:true, quickViews:true, connectors:true },
  // Expanded Compare → docked 50/50 split (3D left half, 2D drawing right half) instead of a
  // centered overlay, so the wizard stays usable while the drawing updates live. Points only;
  // the shared engine gates this on the flag (Lines keeps its centered expanded overlay).
  compareSplit:true,
  // 2D drawing pedagogy: the Compare card surfaces the folded sheet ONLY on the Unfold step
  // (showDrawing), so the counterintuitive distHP→p′ / distVP→p mapping is never shown before
  // unfolding is taught. draw2D still guards its own empty-state on showHP && showVP.
  compareGate: v => v.showDrawing,
  // Reset arms a confirm only when there is work to lose (any distance / quadrant off default);
  // at defaults it resets instantly.
  resetConfirmWhen: d => d.distHP!==20 || d.distVP!==20 || d.distRP!==0 || d.quadrant!=='Q1',
  afterRebuild: d => { sync(d); },
  wireControls,
  // Problem Library (Inc6): loading a problem routes to Step 1 (Quadrants); the student then walks
  // the rail — Quadrant → HP → VP → PP — dialing one control per step. The self-check fires on every
  // rebuild via the state-change bus, so it lights green on a ±0.5 mm match regardless of which step
  // is showing. The library never auto-fills.
  problems:{ list:PROBLEMS, tiers:TIERS, fieldLabels:FIELD_LABELS, entryStep:()=>0 },
  // First-seen contextual spotlights (one chip at a time). Tone dots: hp=teal, vp=amber,
  // ink=neutral — colour PLUS label (Two-Cue Rule). Step → id mapping lives in steps.js.
  spotlights:{
    'quadrants':  { tone:'ink', text:'Switch quadrants — point P jumps to a different room around the fold line.' },
    'top-view':   { tone:'hp',  text:'Top view p — P dropped straight down onto the HP (teal, solid).' },
    'front-view': { tone:'vp',  text:'Front view p′ — P projected back onto the VP (amber, dashed).' },
    'profile':    { tone:'ink', text:'Distance from PP slides P sideways along the fold line — the third coordinate.' },
    'unfold':     { tone:'ink', text:'Press Animate Unfolding — HP swings down flat to make the 2D sheet.' },
  },
  foldBtn:'btn-anim',
  foldLabels:{ idle:'▶ Animate Unfolding', refold:'↩ Fold back to 3D', forward:'Animating…', reverse:'Folding…' },
  foldAnnounce:{
    forward:'Horizontal plane unfolded onto the vertical plane — the 2D drawing is complete.',
    reverse:'Folded back into the 3D view — the point is restored in space.',
    forwardReduced:'Planes unfolded. Showing the 2D drawing.',
    reverseReduced:'Folded back into the 3D view.',
  },
});
