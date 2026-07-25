// lineSteps.js — pure data layer: the guided sequence (STEPS) + inline glossary
// (TERMS) for Projection of Straight Lines. Rendered by the stepper in lines.js.
//
// This is a PROBLEM-SOLVING stepper (not a tour of preset orientations): the learner
// builds ONE general line and works it through the way a textbook problem is solved —
//   1. True Length   → set the line's real length
//   2. Distance HP/VP → place end A in space
//   3. Inclinations   → tilt it (θ with HP, φ with VP) and recover the true length
//   4. Generate Orthographic Projections → fold the planes flat
//   5. Draw Traces    → find where the line pierces each plane (HT / VT)
//
// Because every orientation is just the general case at particular angles (θ,φ → 0/90),
// every step pins the SAME case: LineCase.INCL_BOTH (the general resolver). θ/φ are NOT
// put in any step's `set`, so values the learner dials persist as they move forward/back.
// Each step exposes ONLY its own control(s) — True Length on step 1, distance from HP/VP on
// step 2, θ/φ on step 3, the fold button on step 4, the traces button on step 5 — so the line
// is built up one dedicated control at a time (the dialled values persist across the steps).
// All steps show the line + both views; the fold + traces buttons appear via these per-step
// `controls`, not via view flags.

import { LineCase } from './lineData.js';

const T = (k, label) => `<button class="term" data-t="${k}">${label}</button>`;

export const STEPS = [
  {
    id: 'true-length',
    title: 'True Length',
    lead: 'Start with the real length of the line in space — its true length.',
    body: [
      `The ${T('tl','true length')} is how long the stick actually is, before any view squashes it — every projection problem begins from this one measurement.`,
      `Right now the line lies flat and square to both planes, so both the ${T('fv','front view')} and the ${T('tv','top view')} read the full true length. Set the length your problem gives you.`,
    ],
    hint: 'Drag True Length — the 3D stick and both of its views grow together.',
    spotlight: 'two-views',
    set: { case: LineCase.INCL_BOTH },
    controls: ['tl'],
    view: { showLine: true, showFV: true, showTV: true },
    orbitHint: true,
  },
  {
    id: 'position',
    title: 'Distance from HP & VP',
    lead: 'Place the line in space: how far end A sits above the floor and in front of the wall.',
    body: [
      `A line needs a home. The ${T('hp','HP')} is the floor and the ${T('vp','VP')} is the wall; the two distance sliders lift end A above the floor and push it out in front of the wall.`,
      `Watch each view slide away from the ${T('xy','XY line')} as you change the distances — the height feeds the ${T('fv','front view')}, the depth feeds the ${T('tv','top view')}.`,
    ],
    hint: 'Set Distance from HP and Distance from VP to place end A exactly where the problem states.',
    set: { case: LineCase.INCL_BOTH },
    controls: ['disthp', 'distvp'],
    view: { showLine: true, showFV: true, showTV: true },
  },
  {
    id: 'inclinations',
    title: 'Inclinations (θ & φ)',
    lead: 'Tilt the line: θ is its angle with the floor, φ its angle with the wall.',
    body: [
      `Now lean the stick. ${T('theta','θ')} tilts it up from the ${T('hp','HP')}; ${T('phi','φ')} swings it away from the ${T('vp','VP')}. A real line only holds together while θ + φ ≤ 90°.`,
      `The instant it tilts, each view leans away from its plane and looks shorter than the real stick — that apparent shrink is ${T('foreshorten','foreshortening')}. Open <b>True Length &amp; Angles</b> to rotate the shortened views back and recover the real length and the true angles.`,
    ],
    hint: 'Slide θ and φ — both views foreshorten. Use True Length & Angles to rotate them back to the real length.',
    spotlight: 'foreshorten',
    set: { case: LineCase.INCL_BOTH },
    controls: ['theta', 'phi', 'truelength'],
    view: { showLine: true, showFV: true, showTV: true },
  },
  {
    id: 'projections',
    title: 'Generate Orthographic Projections',
    lead: 'Fold the floor down onto the wall to lay both views flat on one sheet.',
    body: [
      `The drawing you hand in is flat. Folding the ${T('hp','HP')} down about the ${T('xy','XY line')} swings the ${T('tv','top view')} below the line while the ${T('fv','front view')} stays above it — the standard orthographic sheet.`,
      `Press Generate to watch the floor hinge flat. The clean, square-on read also waits in the Compare card.`,
    ],
    hint: 'Press Generate Orthographic Projection to fold the planes flat, then Fold back to 3D to return.',
    spotlight: 'true-length',
    set: { case: LineCase.INCL_BOTH },
    controls: ['fold'],
    view: { showLine: true, showFV: true, showTV: true },
    done: (d, v) => v.folded,
    doneText: 'Orthographic projection generated.',
  },
  {
    id: 'traces',
    title: 'Draw Traces',
    lead: 'Find where the line — extended if it must be — pierces each plane: its traces.',
    body: [
      `A ${T('trace','trace')} is the point where the line, or its extension, meets a reference plane. The ${T('ht','horizontal trace')} (HT) lands on the floor; the ${T('vt','vertical trace')} (VT) lands on the wall.`,
      `Show Traces animates the textbook construction: extend the ${T('fv','front view')} to XY at h and drop a projector; extend the ${T('tv','top view')} to XY at v and raise one. Where each meets the other view is the trace.`,
    ],
    hint: 'Press Show Traces to build the HT and VT step by step on the 2D sheet.',
    set: { case: LineCase.INCL_BOTH },
    controls: ['traces'],
    view: { showLine: true, showFV: true, showTV: true },
  },
];

export const STEP_COUNT = STEPS.length;

export const TERMS = {
  hp:   { label: 'Horizontal Plane (HP)', def: 'The flat teal reference plane (the floor). The top view is projected onto it.' },
  vp:   { label: 'Vertical Plane (VP)',   def: 'The upright amber reference plane (the wall). The front view is projected onto it.' },
  xy:   { label: 'XY line',               def: 'The reference (ground) line where HP and VP meet. Every view is measured from it.' },
  tl:   { label: 'True Length (TL)',      def: 'The real, unforeshortened length of the line in space.' },
  fv:   { label: 'Front View (Elevation)',def: "The line's projection onto VP — what you see looking horizontally at the wall." },
  tv:   { label: 'Top View (Plan)',       def: "The line's projection onto HP — what you see looking straight down at the floor." },
  theta:{ label: 'θ — true inclination with HP', def: 'The real angle the line makes with the Horizontal Plane.' },
  phi:  { label: 'φ — true inclination with VP', def: 'The real angle the line makes with the Vertical Plane.' },
  alpha:{ label: 'α — apparent angle of FV', def: 'The angle the front view makes with XY in the drawing. Always ≥ θ.' },
  beta: { label: 'β — apparent angle of TV', def: 'The angle the top view makes with XY in the drawing. Always ≥ φ.' },
  projector: { label: 'Projector', def: 'A thin construction line dropped perpendicular from a point in space to a plane.' },
  trace:{ label: 'Trace', def: 'The point where a line — or its extension — meets a reference plane.' },
  ht:   { label: 'Horizontal Trace (HT)', def: 'Where the line (or its extension) meets HP. Found by extending the front view to XY at h, then projecting down to the top view.' },
  vt:   { label: 'Vertical Trace (VT)', def: 'Where the line (or its extension) meets VP. Found by extending the top view to XY at v, then projecting up to the front view.' },
  locus:{ label: 'Locus', def: 'The path traced by a point as the line is rotated — here, the horizontal line a rotated endpoint must stay on.' },
  foreshorten: { label: 'Foreshortening', def: 'The way a tilted line looks shorter than it really is, because it leans away from you — like a pencil pointed at your eye. A view is foreshortened whenever the line is not parallel to that plane.' },
};
