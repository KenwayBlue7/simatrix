// dimensioning.js — orchestrator for the Dimensioning lesson, built on the shared
// engine (src/engine.js) in single-window mode. The SAME machine part as the
// Line-types lesson (src/partData.js), now dimensioned. Two pieces of interactive
// state live in the data object so the engine's rebuild() redraws them: dimMode
// ('aligned' | 'uni') flips the figure orientation, and choice ('a' | 'b' | null)
// records the mini-challenge answer. The shared drawDim() renders every dimension, so
// the linework matches the Line-types lesson exactly.
import * as THREE from 'three';
import { initSim, alb } from './src/engine.js';
import { MACHINE_PART, drawPart, drawDim } from './src/partData.js';
import { STEPS, TERMS } from './src/dimSteps.js';

const $ = id => document.getElementById(id);
const { hw: HW, hh: HH } = MACHINE_PART.box;
const D = MACHINE_PART.dims;

// Small ✓ / ✗ verdict glyph beside the placed dimension.
function mark(g, color, glyph, y){
  alb(g, glyph, HW + 0.55, y, MACHINE_PART.box.hd, color, 0.6, 0.6, false, 128);
}

function draw3D(g, ctx){
  const { raw, view, COL } = ctx;
  drawPart(g, COL, { visible: true, hidden: true, centre: true });

  if(view.showDim){
    drawDim(g, { ...D.width,  linePos: -HH - 0.9, ext: true, color: COL.ink2, text: D.width.label,  mode: raw.dimMode });
    drawDim(g, { ...D.height, linePos: -HW - 0.9, ext: true, color: COL.ink2, text: D.height.label, mode: raw.dimMode });
  }

  if(view.showChallenge){
    if(raw.choice === 'a'){            // correct — outside, on extension lines
      drawDim(g, { ...D.width, linePos: -HH - 0.9, ext: true, color: COL.success, text: D.width.label, mode: 'uni' });
      mark(g, COL.success, '✓', -HH - 0.9);
    } else if(raw.choice === 'b'){     // wrong — straight through the body
      drawDim(g, { ...D.width, linePos: 0, ext: false, color: COL.vp, text: D.width.label, mode: 'uni' });
      mark(g, COL.vp, '✗', 0);
    }
  }
}

// ── Feedback copy for the mini-challenge (re-homed from the old checkAnswer). ──
const FEEDBACK = {
  a: { cls: 'ok',  html: '<strong>✓ Correct.</strong> Dimension lines belong outside the object boundary, joined to it by thin extension lines. Running a dimension through the body violates SP 46:2003 and is ambiguous for the manufacturer.' },
  b: { cls: 'bad', html: '<strong>✗ Not quite.</strong> Dimension lines must not pass through the object. They belong outside, connected to the boundary by extension lines — Option A shows the correct practice.' },
};

// ── Lesson-specific control wiring (system toggle + challenge options) ─
function wireControls({ rebuild, getData, announce }){
  const setMode = m => rebuild({ ...getData(), dimMode: m });
  $('tg-aligned')?.addEventListener('click', () => setMode('aligned'));
  $('tg-uni')?.addEventListener('click', () => setMode('uni'));

  const choose = c => {
    rebuild({ ...getData(), choice: c });   // draw3D renders the chosen placement
    $('opt-a')?.classList.add('correct');    // always reveal A as the correct answer
    $('opt-b')?.classList.add('incorrect');
    const fb = $('challenge-feedback');
    if(fb){ fb.className = 'challenge-feedback show ' + FEEDBACK[c].cls; fb.innerHTML = FEEDBACK[c].html; }
    announce(c === 'a'
      ? 'Correct. The dimension is placed outside the part on extension lines.'
      : 'Not quite. A dimension line must not run through the body of the part.');
  };
  $('opt-a')?.addEventListener('click', () => choose('a'));
  $('opt-b')?.addEventListener('click', () => choose('b'));
}

// Keep the segmented toggle in sync with data; clear the challenge UI on reset.
function afterRebuild(d){
  $('tg-aligned')?.classList.toggle('on', d.dimMode === 'aligned');
  $('tg-uni')?.classList.toggle('on', d.dimMode === 'uni');
  $('tg-aligned')?.setAttribute('aria-pressed', String(d.dimMode === 'aligned'));
  $('tg-uni')?.setAttribute('aria-pressed', String(d.dimMode === 'uni'));
  if(d.choice === null){
    $('opt-a')?.classList.remove('correct');
    $('opt-b')?.classList.remove('incorrect');
    const fb = $('challenge-feedback');
    if(fb){ fb.className = 'challenge-feedback'; fb.innerHTML = ''; }
  }
}

// ── Screen-reader mirror of the viewport result ───────────────
function describe(d, view){
  if(view.showChallenge){
    if(d.choice === 'a') return 'Correct. The 80 millimetre width is dimensioned outside the part on extension lines.';
    if(d.choice === 'b') return 'Incorrect. The 80 millimetre width is dimensioned through the body of the part.';
    return 'Choose whether the width dimension should sit outside the object or run through it.';
  }
  const sys = d.dimMode === 'aligned' ? 'aligned' : 'unidirectional';
  return `The machine part is dimensioned in the ${sys} system: width 80 millimetres, height 50 millimetres.`;
}

// ── Start the lesson ──────────────────────────────────────────
initSim({
  mode: 'single',
  chap: 'dimensioning',
  steps: STEPS,
  terms: TERMS,
  tokens: { success: '--color-success' },     // clay/incorrect reuses the base vp token
  defaultData: () => ({ dimMode: 'aligned', choice: null }),
  defaultView: { showDim: false, showDimMode: false, showChallenge: false },
  draw3D,
  wireControls,
  afterRebuild,
  describe,
  cam3: { p: new THREE.Vector3(6.5, 4.5, 6.5), t: new THREE.Vector3(0, 0, 0) },
});
