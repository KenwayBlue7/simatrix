// lineSteps.js — pure data layer: the guided sequence (STEPS) + inline glossary (TERMS).
//
// REVERSE TOPIC fork of Topic 6's lineSteps.js. Topic 6 is a build-up stepper (5 dedicated
// steps, one control revealed at a time, because the learner is CONSTRUCTING the drawing).
// This topic shows a FINISHED drawing and asks for one or more numbers — there is nothing to
// build up to, so there is exactly ONE step: the given-data panel, the guess panel, and both
// construction launchers (True Length & Angles / Traces — useful for checking your own working
// against the textbook method once you've committed to a guess) are all visible together.
//
// LineCase.INCL_BOTH stays the pinned case (unchanged from Topic 6 — every textbook problem here
// is the general case; parallel/perpendicular cases just have θ or φ pinned at 0/90 in the
// problem's own shapeData, same as Topic 6's target objects did).

import { LineCase } from './lineData.js';

export const STEPS = [
  {
    id: 'solve',
    title: 'Solve the Problem',
    lead: 'The drawing is already complete — read it, then guess the missing value(s).',
    body: [
      'Pick a problem from <b>Practice problems</b>. Its drawing is drawn for you, fully — the fields it hands you are shown under <b>Given</b>; the fields it asks for are blank boxes under <b>Your guess</b>.',
      'Study the drawing (orbit it, open Compare for the flat 2D sheet) and work the construction out — on paper or in your head — the same way the textbook does it. Type your numbers in; the self-check lights up once every guess is within half a unit of the answer.',
    ],
    hint: 'No sliders to drag here — everything you need is already drawn. Measure, construct, then type your answer.',
    set: { case: LineCase.INCL_BOTH },
    controls: ['given', 'guess', 'truelength', 'traces'],
    view: { showLine: true, showFV: true, showTV: true },
    orbitHint: true,
    spotlight: 'reverse-flow',
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
