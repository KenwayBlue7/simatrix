// linetypes.js — orchestrator for the Types-of-lines lesson, built on the shared
// engine (src/engine.js) in single-window mode: one orbitable 3D scene, no 2D PiP,
// no toggle bar, no fold. All real machinery — renderer stack, canvas sizing, the
// guided stepper, term popovers, simAPI, the boot watchdog — lives in the engine.
// This file supplies the lesson's pure data (linetypeSteps) and a single draw3D, and
// reuses the shared machine part (src/partData.js) so the Dimensioning lesson draws
// the identical object.
//
// RAIL-DRIVEN with a CUMULATIVE reveal: each step's view flags switch another BIS
// line type on (visible → hidden → centre → dimension), and `view.focus` names the
// one just introduced so the viewport captions it in its own colour.
import * as THREE from 'three';
import { initSim, alb } from './src/engine.js';
import { MACHINE_PART, drawPart, drawDim } from './src/partData.js';
import { STEPS, TERMS } from './src/linetypeSteps.js';

const { hw: HW, hh: HH } = MACHINE_PART.box;

// Caption for the line type introduced on the current step, in its token colour.
const FOCUS = {
  visible: { text: 'Continuous thick — visible edges', key: 'ink'   },
  hidden:  { text: 'Dashed — hidden edges',            key: 'bench' },
  centre:  { text: 'Chain — centre line / axis',       key: 'ink'   },
  dim:     { text: 'Continuous thin — dimensions',     key: 'ink2'  },
};

function draw3D(g, ctx){
  const { view, COL } = ctx;
  drawPart(g, COL, { visible: view.showVisible, hidden: view.showHidden, centre: view.showCentre });

  if(view.showDim){
    const d = MACHINE_PART.dims;
    drawDim(g, { ...d.width,  linePos: -HH - 0.9, ext: true, color: COL.ink2, text: d.width.label,  mode: 'uni' });
    drawDim(g, { ...d.height, linePos: -HW - 0.9, ext: true, color: COL.ink2, text: d.height.label, mode: 'uni' });
  }

  if(view.focus && FOCUS[view.focus]){
    const f = FOCUS[view.focus];
    alb(g, f.text, 0, HH + 1.0, 0, COL[f.key], 3.0, 0.45, false, 512);
  }
}

// ── Screen-reader mirror of the viewport result ───────────────
function describe(_d, view){
  const on = [];
  if(view.showVisible) on.push('visible edges (continuous thick)');
  if(view.showHidden)  on.push('hidden edges (dashed)');
  if(view.showCentre)  on.push('the centre line (chain)');
  if(view.showDim)     on.push('dimension lines (continuous thin)');
  return on.length ? `The machine part shows ${on.join(', ')}.` : '';
}

// ── Start the lesson ──────────────────────────────────────────
initSim({
  mode: 'single',
  chap: 'linetypes',
  steps: STEPS,
  terms: TERMS,
  defaultData: () => ({}),
  defaultView: { showVisible: false, showHidden: false, showCentre: false, showDim: false, focus: null },
  draw3D,
  describe,
  cam3: { p: new THREE.Vector3(6.5, 4.5, 6.5), t: new THREE.Vector3(0, 0, 0) },
});
