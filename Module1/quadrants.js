// quadrants.js — orchestrator for Lesson 4 (The four quadrants), built on the shared
// engine (src/engine.js) in single-window mode: one orbitable 3D scene, no 2D PiP,
// no toggle bar, no fold. All real machinery — renderer stack, canvas sizing, the
// guided stepper, term popovers, simAPI, the boot watchdog — lives in the engine.
// This file supplies the lesson's pure data (quadrantSteps) and a single draw3D, and
// reuses the Points sim's pure data layer (src/pointData.js) verbatim.
//
// The quadrant is RAIL-DRIVEN: each quadrant is its own step, so the active quadrant
// arrives on view.quadrant (set in quadrantSteps.js), not from the data object. We
// resolve the point's signed position locally for that quadrant — the same sign
// logic and the same world-axis remap as the Points sim's draw3D — and highlight the
// matching I–IV dihedral label. The HP / VP sliders move P within the current room.
import * as THREE from 'three';
import { initSim, apl, alp, asg, asp, acr, albBox, alb, toW, setRange } from './src/engine.js';
import { resolvePosition, defaultPointData } from './src/pointData.js';
import { STEPS, TERMS } from './src/quadrantSteps.js';

const $ = id => document.getElementById(id);

// ── 3D scene ──────────────────────────────────────────────────
// World axes (engineering-correct — both planes share the X-axis fold line), copied
// from the Points sim's draw3D so the geometry reads identically across lessons:
//   HP = XZ plane (y=0)   VP = XY plane (z=0)   fold line = X-axis
//   lateral distRP → X · height distHP → Y · depth distVP → Z (in front of VP = +Z)
// ctx = { model, raw, view, COL }; view carries the per-step flags merged over
// defaultView, including view.quadrant (Q1–Q4 on the quadrant steps, null on intro).
function draw3D(g, ctx){
  const { raw, view, COL } = ctx;
  const S = 9;
  const quadrant = view.quadrant || null;

  apl(g,S,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0));          // HP floor (XZ, y=0)
  alp(g,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));                   // VP wall  (XY, z=0)
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);                        // fold line (X-axis)
  alb(g,'HP',-3.6,-.3,3.6,COL.hp,2.0,.78); alb(g,'VP',-3.6,3.7,.05,COL.vp,2.0,.78);
  alb(g,'XY',S/2-.5,-.35,0,COL.ink,1.0,.5);

  if(view.showQuad){
    [{t:'I',x:4.1,y:4.1,z:4.1,q:'Q1'},{t:'II',x:4.1,y:4.1,z:-4.1,q:'Q2'},
     {t:'III',x:4.1,y:-4.1,z:-4.1,q:'Q3'},{t:'IV',x:4.1,y:-4.1,z:4.1,q:'Q4'}]
    .forEach(l=>alb(g,l.t,l.x,l.y,l.z,l.q===quadrant?COL.ink:COL.bench,.65,.32));
  }

  if(!view.showPoint || !quadrant) return;
  const pos=resolvePosition({ ...raw, quadrant });
  const q={x:toW(pos.z), y:toW(pos.y), z:toW(pos.x)};           // remap (lateral, height, depth)

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

// ── HP / VP slider sync (keeps the controls tracking the data) ─
const HPVT = v => `${v} centimetres from HP`;
const VPVT = v => `${v} centimetres from VP`;
function sync(d){ setRange('r-hp','n-hp',d.distHP,HPVT); setRange('r-vp','n-vp',d.distVP,VPVT); }

// ── Lesson-specific control wiring (HP / VP, mirrors the Points sim) ─
function wireControls({ rebuild, getData, setNote }){
  [['r-hp','n-hp','distHP'],['r-vp','n-vp','distVP']].forEach(([r,n,k])=>{
    $(r).addEventListener('input',()=>rebuild({ ...getData(), [k]:+$(r).value||0 }));
    $(n).addEventListener('change',()=>{
      const v=parseFloat($(n).value), note='note-'+r.slice(2);
      if(!isFinite(v)||v<0){                            // reject: restore + explain (no silent revert)
        sync(getData()); $(n).setAttribute('aria-invalid','true');
        setNote(note,'Enter a number from 0 to 200 cm.');
      } else if(v>200){                                 // clamp: accept the cap, but say so
        rebuild({ ...getData(), [k]:200 }); setNote(note,'The maximum is 200 cm, so 200 cm is used.');
      } else {
        rebuild({ ...getData(), [k]:v });
      }
    });
  });
}

// ── Screen-reader mirror of the viewport result ───────────────
const QNAME={Q1:'one',Q2:'two',Q3:'three',Q4:'four'};
function describe(d,view){
  if(!view.showPoint || !view.quadrant) return '';
  const q=view.quadrant, aboveHP=(q==='Q1'||q==='Q2'), frontVP=(q==='Q1'||q==='Q4');
  return `Quadrant ${QNAME[q]}. Point P is ${d.distHP} centimetres ${aboveHP?'above':'below'} the horizontal plane `+
         `and ${d.distVP} centimetres ${frontVP?'in front of':'behind'} the vertical plane.`;
}

// ── Start the lesson ──────────────────────────────────────────
initSim({
  mode: 'single',
  chap: 'quadrants',
  steps: STEPS,
  terms: TERMS,
  defaultData: () => ({ ...defaultPointData(), distHP:30, distVP:30 }),
  defaultView: { showPoint:false, showHP:false, showVP:false, showQuad:false, quadrant:null },
  draw3D,
  wireControls,
  afterRebuild: d => sync(d),
  describe,
});
