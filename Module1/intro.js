// intro.js — orchestrator for Lesson 1 (The two reference planes), the module entry
// page (index.html). The first lesson built on the shared engine (src/engine.js) in
// single-window mode: one orbitable 3D scene, no 2D PiP, no toggle bar, no fold.
//
// All real machinery — renderer stack, JS-owned canvas sizing, the guided stepper,
// term popovers, simAPI, the boot watchdog — lives in the engine. This file only
// supplies the lesson's pure data (planeData / planeSteps) and a single draw3D, then
// calls initSim({ mode:'single', … }).
import * as THREE from 'three';
import { initSim, apl, alp, asg, alb } from './src/engine.js';
import { defaultPlaneData } from './src/planeData.js';
import { STEPS, TERMS } from './src/planeSteps.js';

// ── 3D scene ──────────────────────────────────────────────────
// The canonical textbook pictorial, identical to the head of the Points sim's
// draw3D (main.js): HP = XZ plane (y=0, teal floor), VP = XY plane (z=0, amber
// wall), fold line = the X-axis (their true intersection), with HP / VP / XY
// labels. The lesson has no point and no projectors — just the two planes meeting
// at xy. ctx = { model, raw, view, COL } is supplied by the engine; view carries
// the per-step flags ({ ...defaultView, ...step.view }).
function draw3D(g, ctx){
  const { view, COL } = ctx;
  const S = 9;

  apl(g,S,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0));               // HP floor (XZ, y=0)
  alp(g,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));                        // VP wall  (XY, z=0)
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);

  // Fold line along the X-axis. Stays INK (Chrome-Only-Blue rule — no accent
  // linework inside the viewport); step 2 just draws it heavier and adds a small
  // ink callout, a two-cue emphasis (weight + label, not colour).
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0, view.emphasizeFold ? 4.2 : undefined);

  alb(g,'HP',-3.6,-.3,3.6,COL.hp,2.0,.78);
  alb(g,'VP',-3.6,3.7,.05,COL.vp,2.0,.78);
  alb(g,'XY',S/2-.5,-.35,0,COL.ink,1.0,.5);
  if(view.emphasizeFold) alb(g,'fold line',0,-.45,0,COL.ink,2.0,.4);
}

// ── Start the lesson ──────────────────────────────────────────
initSim({
  mode: 'single',
  chap: 'planes',
  steps: STEPS,
  terms: TERMS,
  defaultData: defaultPlaneData,
  defaultView: { emphasizeFold: false },
  draw3D,
});
