// firstangleSteps.js — pure data layer for Lesson 5 (First-angle projection & the
// fold). No Three.js, no DOM nodes. Defines the 3-step teaching sequence + the inline
// term glossary; the shared engine (src/engine.js) renders these into the step card
// and wires the term popovers. Body/hint copy is authored HTML (trusted, no user
// input) so it can embed <button class="term"> definitions.
//
// This re-homes the BIS first-angle text + the fold explanation from the old
// scrolling index.html into a guided lesson whose climax is the rabatment animation:
// HP swings 90° about the xy fold line to lie flat on VP, showing why the top view
// ends up BELOW the line. The demonstration point is FIXED (first quadrant) so all
// attention stays on the fold and the first-angle symbol fading in — movable points
// are already taught in the Points sim.
//
// Each step declares:
//   id        — stable key
//   title     — the tutor's headline (Title type)
//   lead      — one-sentence explanation under the title (Lead type)
//   body[]    — paragraphs of instruction (Body type); may contain term buttons
//   hint      — optional accent-wash callout
//   controls  — revealed controls (progressive disclosure): 'anim' (the fold button)
//   view      — viewport flags consumed by firstangle.js draw3D, merged over
//               defaultView { showPoint, showHP, showVP, showSymbol }
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
  foldline: {
    label: 'fold line',
    def: 'The fold line (XY) — the edge where HP and VP meet. Once HP is folded down flat, every height and depth is measured from this line.',
  },
  projector: {
    label: 'projector',
    def: 'Projector — the thin perpendicular line from the point to a plane. It always meets the plane at 90°.',
  },
  topview: {
    label: 'top view',
    def: 'Top view (p) — what you see looking straight down from above. It lands on HP and is written with a lower-case letter, p.',
  },
  frontview: {
    label: 'front view',
    def: 'Front view (p′) — what you see looking straight from the front. It lands on VP and is written p-prime, p′.',
  },
  firstangle: {
    label: 'first-angle projection',
    def: 'First-angle projection — the Indian / European convention (SP 46:2003) where the object sits between you and the plane, so the top view ends up below the XY line.',
  },
  rabatment: {
    label: 'rabatment',
    def: 'Rabatment — rotating one plane about the fold line until it lies flat in the plane of the other, the way a book cover folds about its spine. It is how a 3D layout becomes a flat drawing.',
  },
});

/** The guided sequence, in order. */
export const STEPS = Object.freeze([
  {
    id: 'setup',
    title: 'A point in the first angle',
    lead: 'Start with a single point sitting above HP and in front of VP — squarely in the first quadrant.',
    body: [
      'Orbit the scene. Point <b>P</b> floats above the teal <button type="button" class="term" data-t="hp">HP</button> and ahead of the amber <button type="button" class="term" data-t="vp">VP</button>. Its teal <button type="button" class="term" data-t="projector">projector</button> drops to the <button type="button" class="term" data-t="topview">top view</button> <b>p</b> on HP; its amber projector reaches back to the <button type="button" class="term" data-t="frontview">front view</button> <b>p′</b> on VP.',
      'In space the two views sit on different planes at right angles. A drawing, though, has to live on one flat sheet — so the two planes must somehow become one. That is what the fold does.',
    ],
    hint: 'Notice p is on the floor and p′ is on the wall. Right now they are 90° apart. The fold will bring them onto a single plane.',
    controls: [],
    view: { showPoint: true, showHP: true, showVP: true },
    orbitHint: true,
  },
  {
    id: 'fold',
    title: 'Fold the horizontal plane down',
    lead: 'To get one sheet, swing HP down about the fold line until it lies flat in the plane of VP.',
    body: [
      'Press <b>Animate the fold</b>. HP performs a <button type="button" class="term" data-t="rabatment">rabatment</button> — it rotates 90° about the <button type="button" class="term" data-t="foldline">fold line</button> until it is coplanar with VP, exactly like a book cover closing onto its spine.',
      'Because the object sits <b>between the observer and the plane</b> in <button type="button" class="term" data-t="firstangle">first-angle projection</button>, the top view <b>p</b> swings down and ends up <b>below</b> the XY line, while the front view <b>p′</b> stays above it.',
    ],
    hint: 'The perpendicular projector to HP does not change length as the plane folds — it just rides down with it. Press the button again to fold back to 3D.',
    controls: ['anim'],
    view: { showPoint: true, showHP: true, showVP: true },
    done: (d, v) => v.folded,
    doneText: 'Folded into first-angle layout.',
  },
  {
    id: 'meaning',
    title: 'First-angle projection',
    lead: 'Front view above, top view below — the stacked layout that defines the Indian standard.',
    body: [
      'That finished arrangement — <b>p′</b> above the XY line, <b>p</b> below it — is <button type="button" class="term" data-t="firstangle">first-angle projection</button>, the convention set by <b>SP 46:2003 (BIS)</b> and used throughout this course. The small truncated-cone <b>symbol</b> on the sheet is the standard mark that tells any engineer a drawing is in first angle.',
      'Every projection you draw from here follows this rule. Next, place and solve real points and lines with it in the <b>Projection of Points</b> and <b>Projection of Lines</b> simulations.',
    ],
    hint: 'Open the <a href="./points.html">Projection of Points</a> or <a href="./lines.html">Projection of Lines</a> sim to put first-angle projection to work.',
    controls: [],
    view: { showPoint: true, showHP: true, showVP: true, showSymbol: true },
  },
]);

/** Convenience: total number of steps. */
export const STEP_COUNT = STEPS.length;
