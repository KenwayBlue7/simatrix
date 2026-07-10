// quadrantSteps.js — pure data layer for Lesson 4 (The four quadrants).
// No Three.js, no DOM nodes. Defines the teaching sequence + the inline term
// glossary; the shared engine (src/engine.js) renders these into the step card and
// wires the term popovers. Body/hint copy is authored HTML (trusted, no user input)
// so it can embed <button class="term"> definitions.
//
// This re-homes the four "quadrant cards" from the old scrolling index.html (the
// interactive SVG diagram's quadData) into a guided lesson the student orbits. The
// quadrant is RAIL-DRIVEN: each quadrant is its own step, and the step's
// view.quadrant tells quadrants.js draw3D which dihedral region to place P in and
// which I–IV label to highlight. The HP / VP sliders keep P movable within a step.
//
// Each step declares:
//   id        — stable key
//   title     — the tutor's headline (Title type)
//   lead      — one-sentence explanation under the title (Lead type)
//   body[]    — paragraphs of instruction (Body type); may contain term buttons
//   hint      — optional accent-wash callout
//   controls  — revealed controls (progressive disclosure): 'hp' | 'vp'
//   view      — viewport flags consumed by quadrants.js draw3D, merged over
//               defaultView { showPoint, showHP, showVP, showQuad, quadrant }
//   orbitHint — show the one-time "drag to rotate" chip on this step

/** Term glossary. Keys match data-t="…" on term buttons. Definitions shared with
 *  src/steps.js so the vocabulary stays identical across every Module-1 lesson. */
export const TERMS = Object.freeze({
  hp: {
    label: 'HP',
    def: 'Horizontal Plane — the flat reference plane you picture lying down like a tabletop. A point’s top view lands on it.',
  },
  vp: {
    label: 'VP',
    def: 'Vertical Plane — the upright reference plane standing up like a wall behind the object. A point’s front view lands on it.',
  },
  quadrant: {
    label: 'quadrant',
    def: 'Quadrant — one of the four “rooms” that HP and VP divide space into. A point’s quadrant decides whether its views sit above or below the XY line.',
  },
  dihedral: {
    label: 'dihedral angle',
    def: 'Dihedral angle — the angle between two intersecting planes. HP and VP form four of them; we call those four the quadrants.',
  },
  foldline: {
    label: 'fold line',
    def: 'The fold line (XY) — the edge where HP and VP meet. Once HP is folded down flat, every height and depth is measured from this line.',
  },
  firstangle: {
    label: 'first-angle projection',
    def: 'First-angle projection — the Indian / European convention (SP 46:2003) where the object sits between you and the plane, so the top view ends up below the XY line.',
  },
  projector: {
    label: 'projector',
    def: 'Projector — the thin perpendicular line from the point to a plane. It always meets the plane at 90°.',
  },
});

/** The guided sequence, in order. */
export const STEPS = Object.freeze([
  {
    id: 'rooms',
    title: 'Four rooms in space',
    lead: 'HP and VP do more than meet — extended in every direction, they carve all of space into four regions.',
    body: [
      'Orbit the scene. The teal <button type="button" class="term" data-t="hp">HP</button> and the amber <button type="button" class="term" data-t="vp">VP</button> cross at the <button type="button" class="term" data-t="foldline">fold line</button> and divide the space around them into four <button type="button" class="term" data-t="dihedral">dihedral angles</button>.',
      'These four regions are the <button type="button" class="term" data-t="quadrant">quadrants</button>, numbered <b>I, II, III</b> and <b>IV</b>. Where a point lives — above or below HP, in front of or behind VP — decides which quadrant it is in. Step through each one next.',
    ],
    hint: 'The labels I–IV float in the four corners of the crossing planes. They follow the same numbering you will meet in every textbook.',
    controls: [],
    view: { showQuad: true },
    orbitHint: true,
  },
  {
    id: 'q1',
    title: 'Quadrant I — above HP, in front of VP',
    lead: 'The first quadrant is the one engineers use in practice — the point sits above the floor and ahead of the wall.',
    body: [
      'Point <b>P</b> is now placed in Quadrant I: <b>above HP</b> and <b>in front of VP</b>. The teal <button type="button" class="term" data-t="projector">projector</button> drops to its top view <b>p</b> on HP; the amber one reaches back to its front view <b>p′</b> on VP.',
      'Drag the sliders to move P around inside this room. Notice it always stays above HP and in front of VP — that is what makes it Quadrant I.',
    ],
    hint: 'Almost every drawing in this course uses Quadrant I. The other three are taught so the pattern is complete.',
    controls: ['hp', 'vp'],
    view: { showPoint: true, showHP: true, showVP: true, showQuad: true, quadrant: 'Q1' },
  },
  {
    id: 'q2',
    title: 'Quadrant II — above HP, behind VP',
    lead: 'Push the point behind the vertical plane while keeping it above the floor.',
    body: [
      'In Quadrant II, P is still <b>above HP</b> but now <b>behind VP</b> — on the far side of the amber wall. The front view <b>p′</b> lands behind the plane.',
      'Both views now sit on the same side once the planes are unfolded. You will see exactly where they land when you fold the planes in the next lesson.',
    ],
    hint: 'Above HP keeps the top view low; behind VP flips where the front view ends up. Watch the highlighted II label.',
    controls: ['hp', 'vp'],
    view: { showPoint: true, showHP: true, showVP: true, showQuad: true, quadrant: 'Q2' },
  },
  {
    id: 'q3',
    title: 'Quadrant III — below HP, behind VP',
    lead: 'Now the point drops below the floor and stays behind the wall.',
    body: [
      'Quadrant III places P <b>below HP</b> and <b>behind VP</b> — diagonally opposite Quadrant I. The top view <b>p</b> ends up below, the front view <b>p′</b> behind.',
      'Orbit underneath the teal plane to see the point hanging below it. Third-angle projection (used in the USA) is built on this quadrant, but India uses the first.',
    ],
    hint: 'Below HP and behind VP — both signs are negative. It is the mirror image of Quadrant I through the fold line.',
    controls: ['hp', 'vp'],
    view: { showPoint: true, showHP: true, showVP: true, showQuad: true, quadrant: 'Q3' },
  },
  {
    id: 'q4',
    title: 'Quadrant IV — below HP, in front of VP',
    lead: 'The last room: below the floor but still ahead of the wall.',
    body: [
      'In Quadrant IV, P is <b>below HP</b> yet <b>in front of VP</b>. The top view <b>p</b> drops below; the front view <b>p′</b> stays on the near side.',
      'You have now seen all four quadrants. Which one a point lives in is the single most important fact about where its views will land — the story <button type="button" class="term" data-t="firstangle">first-angle projection</button> completes in the next lesson.',
    ],
    hint: 'Ready to see why the top view ends up below the line? Open the First-angle lesson and fold the planes flat.',
    controls: ['hp', 'vp'],
    view: { showPoint: true, showHP: true, showVP: true, showQuad: true, quadrant: 'Q4' },
  },
]);

/** Convenience: total number of steps. */
export const STEP_COUNT = STEPS.length;
