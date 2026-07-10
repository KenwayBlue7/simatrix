// spatialSteps.js — pure data layer for the Spatial Framework guided sequence
// (Quadrants + First-angle combined, the "Room & Shadow" narrative). No Three.js,
// no DOM nodes. stepper.js renders these into the step card and rail; main.js
// consumes the view flags through simController.applyView(). Body/hint copy is
// authored HTML (trusted, no user input) so it can embed <button class="term">
// definitions, exactly as the legacy Module1 step files did.
//
// TERMS merges the glossaries of the two lessons this topic combines —
// Module1/src/quadrantSteps.js and Module1/src/firstangleSteps.js. The five keys
// the two files shared (hp, vp, foldline, projector, firstangle) were verified
// identical before merging; every definition below is carried over verbatim so the
// vocabulary stays identical across the Module-1 family.
//
// Each step declares:
//   id        — stable key
//   title     — the tutor's headline (Title type)
//   lead      — one-sentence explanation under the title (Lead type)
//   body[]    — paragraphs of instruction (Body type); may contain term buttons
//   hint      — optional accent-wash callout
//   controls  — revealed controls (progressive disclosure): 'quadrant' | 'fold'
//   view      — viewport flags merged over DEFAULT_VIEW by simController.applyView()
//   done      — optional (sim) => boolean completion gate; steps without one are
//               reading/exploring steps, complete once the learner moves past them
//   orbitHint — show the one-time "drag to rotate" chip on this step

/** Term glossary. Keys match data-t="…" on term buttons. Definitions verbatim from
 *  quadrantSteps.js + firstangleSteps.js so the vocabulary stays identical across
 *  every Module-1 lesson. */
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
  topview: {
    label: 'top view',
    def: 'Top view (p) — what you see looking straight down from above. It lands on HP and is written with a lower-case letter, p.',
  },
  frontview: {
    label: 'front view',
    def: 'Front view (p′) — what you see looking straight from the front. It lands on VP and is written p-prime, p′.',
  },
  rabatment: {
    // Formally correct French-derived spelling "rabattement" (the data-t KEY stays
    // `rabatment` so every markup binding keeps working — see index.html / step bodies).
    label: 'rabattement',
    def: 'Rabattement — rotating one plane about the fold line until it lies flat in the plane of the other, the way a book cover folds about its spine. It is how a 3D layout becomes a flat drawing.',
  },
});

/** Baseline viewport flags. simController.applyView() merges each step's `view`
 *  over this, so a step only declares what it turns ON. The geometry leaves
 *  (hvPlanes.js, point.js — to build) read the merged result inside rebuild(). */
export const DEFAULT_VIEW = Object.freeze({
  showHP: false,          // the HP sheet (teal, solid — Two-Cue)
  showVP: false,          // the VP sheet (amber; border solid by user override — see hvPlanes.js)
  showQuad: false,        // the four extended quadrant regions + I–IV labels
  showPoint: false,       // the movable point P
  showProjections: false, // projectors + the p / p′ view marks
  showFrustums: false,    // step 5: the Q1/Q3 cone-frustum illustration (frustums.js)
  showSymbol: false,      // the BIS first-angle symbol
  quadrant: null,         // when set, the step pins P into this quadrant
  camPose: null,          // 'showcase' overrides the quadrant-derived camera pose
  foldPose: null,         // fold intent for this step, read by simController.applyView:
                          //   'open'     → drive the hinge back to 0 WITHOUT flipping
                          //                `folded` (step 5 — the open 3D corner survives
                          //                the 4→5→4 round trip)
                          //   'unfolded' → this is a PRE-FOLD step (1–3): if the learner
                          //                arrives here still folded (navigated back from
                          //                step 4), clear `folded` so the hinge animates
                          //                back open and the camera glides off the 2D sheet
});

/** The guided sequence, in order — the 5-step "Room & Shadow" narrative arc. */
export const STEPS = Object.freeze([
  {
    id: 'planes',
    title: 'Reference Planes',
    lead: 'Every projection starts in the corner of a room: a floor, a wall, and the line where they meet.',
    body: [
      'Orbit the scene. The teal floor is the <button type="button" class="term" data-t="hp">HP</button> — the Horizontal Plane. The amber wall is the <button type="button" class="term" data-t="vp">VP</button> — the Vertical Plane. They meet in one straight edge, the <button type="button" class="term" data-t="foldline">fold line</button>, which every textbook labels <b>XY</b>.',
      'Now imagine a light so far away — like the sun — that its rays arrive perfectly parallel. Anything in this corner casts one shadow straight <b>down onto the floor</b> and another straight <b>back onto the wall</b>. Those two shadows are what engineers call <b>projections</b>, and these two planes are where they land.',
    ],
    hint: 'Everything in this course happens between this floor and this wall. Get comfortable orbiting around them before you continue.',
    controls: [],
    view: { showHP: true, showVP: true, foldPose: 'unfolded' },
    orbitHint: true,
  },
  {
    id: 'quadrants',
    title: 'Four Quadrants',
    lead: 'Extend the floor and the wall past their meeting line, and space is sliced into four rooms.',
    body: [
      'The floor keeps going behind the wall; the wall keeps going below the floor. Extended like this, the two planes carve all of space into four <button type="button" class="term" data-t="dihedral">dihedral angles</button> — four “rooms” numbered <b>I, II, III</b> and <b>IV</b>. Each room is a <button type="button" class="term" data-t="quadrant">quadrant</button>.',
      'Use the buttons below to move point <b>P</b> from room to room. Where P lives — above or below the floor, in front of or behind the wall — is the single most important fact about it: it decides where its shadows will land.',
    ],
    hint: 'Quadrant I — above HP, in front of VP — is the room engineers actually draw in. The other three complete the pattern.',
    controls: ['quadrant'],
    view: { showHP: true, showVP: true, showQuad: true, showPoint: true, foldPose: 'unfolded' },
  },
  {
    id: 'setup',
    title: 'First-Angle Setup',
    lead: 'Lock P into Quadrant I and name its two shadows.',
    body: [
      'P now sits squarely in the first quadrant: above the floor, in front of the wall. Its teal <button type="button" class="term" data-t="projector">projector</button> drops straight down to the <button type="button" class="term" data-t="topview">top view</button> — written with a lowercase <b>p</b> — on HP. Its amber projector reaches straight back to the <button type="button" class="term" data-t="frontview">front view</button> — written <b>p′</b>, “p-prime” — on VP.',
      'Lowercase <b>p</b> on the floor, <b>p′</b> on the wall: that naming rule holds for every point you will ever project. But right now the two views live on two different planes at 90° — and a drawing has to fit on one flat sheet.',
    ],
    hint: 'One point, two shadows, two planes. The next step brings both shadows onto a single sheet.',
    controls: [],
    view: { showHP: true, showVP: true, showPoint: true, showProjections: true, quadrant: 'Q1', foldPose: 'unfolded' },
  },
  {
    id: 'fold',
    title: 'Fold',
    lead: 'Treat the floor as a trapdoor hinged at XY, and swing it down flat against the wall.',
    body: [
      'Press <b>Fold HP down</b>. The floor performs a <button type="button" class="term" data-t="rabatment">rabattement</button>: hinged at the <button type="button" class="term" data-t="foldline">fold line</button>, it swings down 90° like a trapdoor until it lies flat in the plane of the wall.',
      'Watch what the trapdoor carries with it. The top view <b>p</b> rides the floor down and ends up <b>below</b> the XY line, while the front view <b>p′</b> never moves — it stays on the wall, <b>above</b> the line. That is the whole trick of <button type="button" class="term" data-t="firstangle">first-angle projection</button>.',
    ],
    hint: 'The projector from P to the floor does not change length as the trapdoor swings — it just rides down with it.',
    controls: ['fold'],
    view: { showHP: true, showVP: true, showPoint: true, showProjections: true, quadrant: 'Q1' },
    done: (sim) => sim.isFolded(),
  },
  {
    id: 'standard',
    title: 'Standard',
    lead: 'Front view above the line, top view below it — the layout the Indian standard is built on.',
    body: [
      'This finished arrangement — <b>p′</b> above the XY line, <b>p</b> below it — is <button type="button" class="term" data-t="firstangle">first-angle projection</button>, the convention fixed by <b>SP 46:2003 (BIS)</b> and used throughout this course. Drawings carry a small truncated-cone <b>symbol</b> to tell any engineer, anywhere, that they are reading first angle.',
      'You now own the framework every later lesson assumes: two planes, four quadrants, one fold. The <b>Projection of Points</b> and <b>Projection of Lines</b> simulations put it to work.',
    ],
    hint: 'Whenever a view lands somewhere unexpected in a later lesson, come back to this fold — the trapdoor explains it every time.',
    controls: [],
    // The classic textbook illustration replaces the Point P rig here: cone
    // frustums in Quadrants I and III with their views + projectors (frustums.js).
    // No showPoint/showProjections — P, its chips, and its projectors all stand
    // down. foldPose 'open' swings the hinge back to the 3D corner WITHOUT
    // flipping `folded` (step 4's ✓ and the 4→5→4 round trip survive); camPose
    // 'showcase' frames both frustums at once.
    view: { showHP: true, showVP: true, showQuad: true, showFrustums: true, showSymbol: true, quadrant: 'Q1', foldPose: 'open', camPose: 'showcase' },
  },
]);

/** Convenience: total number of steps. */
export const STEP_COUNT = STEPS.length;
