// planeSteps.js — pure data layer for Lesson 1 (The two reference planes).
// No Three.js, no DOM nodes. Defines the 3-step teaching sequence + the inline term
// glossary; the shared engine (src/engine.js) renders these into the step card and
// wires the term popovers. Body/hint copy is authored HTML (trusted, no user input)
// so it can embed <button class="term"> definitions.
//
// This re-homes the planes-relevant copy from the old scrolling index.html — the
// hero "language of engineers" framing, the relevance cards, and the BIS framing —
// into a guided lesson the student orbits instead of scrolls. (Line types,
// dimensioning, and the four quadrants move to their own later lessons.)
//
// Each step declares:
//   id        — stable key
//   title     — the tutor's headline (Title type)
//   lead      — one-sentence explanation under the title (Lead type)
//   body[]    — paragraphs of instruction (Body type); may contain term buttons
//   hint      — optional accent-wash callout
//   controls  — revealed controls (none this lesson — the scene is fixed)
//   view      — viewport flags consumed by intro.js draw3D (default: emphasizeFold:false)
//   orbitHint — show the one-time "drag to rotate" chip on this step

/** Term glossary. Keys match data-t="…" on term buttons. Definitions shared with
 *  src/steps.js (the Points sim) so the vocabulary stays identical across lessons. */
export const TERMS = Object.freeze({
  hp: {
    label: 'HP',
    def: 'Horizontal Plane — the flat reference plane you picture lying down like a tabletop. A point’s top view lands on it.',
  },
  vp: {
    label: 'VP',
    def: 'Vertical Plane — the upright reference plane standing up like a wall behind the object. A point’s front view lands on it.',
  },
  foldline: {
    label: 'fold line',
    def: 'The fold line (XY) — the edge where HP and VP meet. Once HP is folded down flat, every height and depth is measured from this line.',
  },
  dihedral: {
    label: 'dihedral angle',
    def: 'Dihedral angle — the angle between two intersecting planes. HP and VP form four of them; we call those four the quadrants.',
  },
  quadrant: {
    label: 'quadrant',
    def: 'Quadrant — one of the four “rooms” that HP and VP divide space into. A point’s quadrant decides whether its views sit above or below the XY line.',
  },
  firstangle: {
    label: 'first-angle projection',
    def: 'First-angle projection — the Indian / European convention (SP 46:2003) where the object sits between you and the plane, so the top view ends up below the XY line.',
  },
});

/** The guided sequence, in order. */
export const STEPS = Object.freeze([
  {
    id: 'planes',
    title: 'The two reference planes',
    lead: 'Engineering graphics is the language of engineers — and it begins with two imaginary planes meeting at a right angle.',
    body: [
      'Orbit the 3D scene. The flat teal plane lying down is the <button type="button" class="term" data-t="hp">Horizontal Plane</button> — picture it as the floor. The upright amber plane standing behind it is the <button type="button" class="term" data-t="vp">Vertical Plane</button> — picture it as the wall.',
      'Every drawing you will ever make starts here: an object is described by how it projects onto these two planes. That is all the apparatus we need.',
    ],
    hint: 'Two cues, never just colour: HP is always teal and drawn solid; VP is always amber and drawn dashed. That pairing never changes across the whole module.',
    controls: [],
    view: {},
    orbitHint: true,
  },
  {
    id: 'fold-line',
    title: 'The fold line (xy)',
    lead: 'Where the two planes meet is the single line we measure everything from.',
    body: [
      'The dark line running along the join of HP and VP is the <button type="button" class="term" data-t="foldline">fold line</button>, written <b>xy</b>. It is the one true intersection of the two planes.',
      'A flat drawing has to live on one sheet, so later we fold HP down about this exact line until it lies in the same plane as VP. From then on, every height and every depth in the drawing is read from <b>xy</b> — which is why it matters more than any other line.',
    ],
    hint: 'Keep your eye on xy. In <button type="button" class="term" data-t="firstangle">first-angle projection</button> the top view ends up below it and the front view above it — but that story comes alive in the Points lesson.',
    controls: [],
    view: { emphasizeFold: true },
  },
  {
    id: 'why',
    title: 'Why this matters — and where next',
    lead: 'These two planes underpin a language understood identically in Chennai, Tokyo, and Berlin.',
    body: [
      'A technical drawing is a <b>universal language</b>: geometry reads the same everywhere, with no words to translate. It carries <b>precise instructions</b> — every dimension and tolerance tells a machinist exactly what to make, because ambiguity costs money. And it is the <b>foundation of all engineering</b>: every bridge, microchip, and aircraft existed first as lines on paper.',
      'India follows the Bureau of Indian Standards code <b>SP 46:2003</b> and <button type="button" class="term" data-t="firstangle">first-angle projection</button>, where the object sits between you and the plane. The four <button type="button" class="term" data-t="dihedral">dihedral angles</button> between HP and VP — the four <button type="button" class="term" data-t="quadrant">quadrants</button> — decide where each view lands.',
      'You have the stage. Next, place a real point in space and watch it project onto both planes in the <b>Projection of Points</b> simulation.',
    ],
    hint: 'Open the <a href="./points.html">Projection of Points</a> sim to see a point lifted above HP and pushed in front of VP, then unfolded into a 2D drawing.',
    controls: [],
    view: {},
  },
]);

/** Convenience: total number of steps. */
export const STEP_COUNT = STEPS.length;
