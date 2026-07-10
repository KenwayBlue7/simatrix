// pointSteps.js — pure data layer for the Projection of Points guided sequence.
// No Three.js, no DOM nodes. stepper.js renders these into the step card and
// rail; main.js consumes the view flags through simController.applyView().
// Body/hint copy is authored HTML (trusted, no user input) so it can embed
// <button class="term"> definitions, exactly as the legacy Module1 step files did.
//
// PROVENANCE: TERMS and the step copy (title / lead / body / hint / spotlight /
// controls) are carried over VERBATIM from the legacy Module1/src/steps.js
// (the retired engine.js-based Points lesson) so the vocabulary and tutor voice
// stay identical across the Module-1 family. The legacy sequence is FIVE steps —
// Quadrants → From HP → From VP → From PP → Unfold (its own eyebrow read
// "Step 1 of 5"). Two deliberate deviations from the legacy data, both noted
// inline where they occur:
//   • view flags are re-expressed in this build's vocabulary (see DEFAULT_VIEW);
//     the legacy showDrawing flag is not carried over — the Compare card this
//     sim MUST ship (ADR-012: Points is a `mode:'dual'` sim) is gated in
//     main.js on the legacy Points compareGate (showHP && showVP), so no extra
//     flag is needed here. The Unfold step's "Open Compare…" sentence is kept.
//   • the legacy per-engine keys (railLabel, done/doneText) are kept, with the
//     done gate re-targeted at simController.isFolded().
//
// Each step declares:
//   id        — stable key
//   railLabel — short label for the step rail chip (the card uses the fuller `title`)
//   title     — the tutor's headline for this idea (Title type)
//   lead      — one-sentence explanation under the title (Lead type)
//   body[]    — paragraphs of instruction (Body type); may contain term buttons
//   hint      — optional accent-wash callout shown when a step might confuse
//   controls  — which parameter controls are revealed this step (progressive
//               disclosure): 'quad' | 'hp' | 'vp' | 'pp' | 'anim' — matched to
//               the [data-ctrl] wrappers in index.html
//   view      — viewport flags merged over DEFAULT_VIEW by simController.applyView()
//   done      — optional (sim) => boolean completion gate; steps without one are
//               reading/exploring steps, complete once the learner moves past them
//   doneText  — badge copy shown once the gated step completes
//   orbitHint — show the one-time "drag to rotate" chip on this step
//   spotlight — id of a one-time contextual spotlight chip (onboarding.js SPOTLIGHTS)

/** Term glossary. Keys match data-t="…" on term buttons in the copy. Definitions
 *  verbatim from Module1/src/steps.js so the vocabulary stays identical across
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
  foldline: {
    label: 'fold line',
    def: 'The fold line (XY) — the edge where HP and VP meet. Once HP is folded down flat, every height and depth is measured from this line.',
  },
  projection: {
    label: 'projection',
    def: 'Projection — the shadow a point casts straight onto a plane, dropped along a perpendicular (at 90°).',
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
  quadrant: {
    label: 'quadrant',
    def: 'Quadrant — one of the four “rooms” that HP and VP divide space into. A point’s quadrant decides whether its views sit above or below the XY line.',
  },
  dihedral: {
    label: 'dihedral angle',
    def: 'Dihedral angle — the angle between two intersecting planes. HP and VP form four of them; we call those four the quadrants.',
  },
  firstangle: {
    label: 'first-angle projection',
    def: 'First-angle projection — the Indian / European convention (SP 46:2003) where the object sits between you and the plane, so the top view ends up below the XY line.',
  },
  pp: {
    label: 'Profile Plane',
    def: 'Profile Plane (PP) — a third plane on the side, at right angles to both HP and VP. Distance from it fixes the point’s side-to-side position.',
  },
});

/** Baseline viewport flags. simController.applyView() merges each step's `view`
 *  over this, so a step only declares what it turns ON. The HP/VP plane SHEETS
 *  are not step-gated in this topic (the corner is on stage from boot); these
 *  flags gate the point and its projection layers:
 *    showPoint — the point P (marker + chip)
 *    showHP    — the TOP VIEW layer: p on HP, its teal projector, its chip
 *    showVP    — the FRONT VIEW layer: p′ on VP, its amber projector, its chip
 *    showCoord — the P(x, y, z) signed-mm coordinate read-out chip
 *    showQuad  — the four extended quadrant sheets + I–IV numerals
 *    foldPose  — 'unfolded' marks a PRE-FOLD step (1–4): arriving here still
 *                folded (the learner navigated back from the Unfold step) clears
 *                the fold so the hinge animates back open. The Unfold step
 *                leaves it null so its fold survives a 5→4→5 round trip is NOT
 *                wanted here — legacy semantics: editing an early step unfolds. */
export const DEFAULT_VIEW = Object.freeze({
  showPoint: false,
  showHP: false,
  showVP: false,
  showCoord: false,
  showQuad: false,
  foldPose: null,
});

/** The guided sequence, in order. Quadrant-first, one control per step, Unfold
 *  last — the legacy five-step arc, copy verbatim. */
export const STEPS = Object.freeze([
  {
    id: 'quadrants',
    railLabel: 'Quadrants',
    title: 'Choose the quadrant',
    lead: 'Start by choosing which “room” the point lives in. A floor and a wall, both running on forever, slice space into four corners.',
    body: [
      'Picture the corner of a room: the flat floor is the <button type="button" class="term" data-t="hp">Horizontal Plane</button> and the upright wall is the <button type="button" class="term" data-t="vp">Vertical Plane</button>. Where they meet is the <button type="button" class="term" data-t="foldline">fold line</button>.',
      'Extended forever, those two surfaces divide all of space into four <button type="button" class="term" data-t="quadrant">quadrants</button> — four <button type="button" class="term" data-t="dihedral">dihedral angles</button>: above or below the floor, in front of or behind the wall. Pick one and watch point <b>P</b> jump to that corner.',
    ],
    hint: 'Quadrant I — above the floor, in front of the wall — is the everyday choice for real drawings. Set the quadrant first; the next steps place the point inside it.',
    spotlight: 'quadrants',
    controls: ['quad'],
    view: { showPoint: true, showQuad: true, foldPose: 'unfolded' },
    orbitHint: true,
  },
  {
    id: 'above-hp',
    railLabel: 'From HP',
    title: 'Distance from HP',
    lead: 'Now lift the point off the floor. First question: how high is it?',
    body: [
      'Drag the slider to raise point <b>P</b>. Picture a light shining straight down from the ceiling: the point throws a shadow straight onto the floor.',
      'That shadow is the <button type="button" class="term" data-t="topview">top view</button>, written <b>p</b> — the <button type="button" class="term" data-t="projection">projection</button> of P onto HP. The thin teal line dropping straight down is the <button type="button" class="term" data-t="projector">projector</button>, meeting the floor at a right angle.',
    ],
    hint: 'Watch the teal dot on the floor. It is exactly the shadow the point casts with a light directly overhead.',
    spotlight: 'top-view',
    controls: ['hp'],
    view: { showPoint: true, showHP: true, showQuad: true, foldPose: 'unfolded' },
  },
  {
    id: 'front-vp',
    railLabel: 'From VP',
    title: 'Distance from VP',
    lead: 'Next: how far does the point stand out from the wall?',
    body: [
      'Drag this slider to push <b>P</b> forward, away from the wall. Now shine a light straight at the wall from the front — the point casts a second shadow, onto the wall.',
      'That wall-shadow is the <button type="button" class="term" data-t="frontview">front view</button>, <b>p′</b> (say “p-prime”). A floor-shadow and a wall-shadow together pin the point down completely — two views are enough to fix it in space.',
    ],
    hint: 'Two cues keep the shadows apart: floor / top view is teal and solid; wall / front view is amber and dashed. Colour is never the only signal.',
    spotlight: 'front-view',
    controls: ['vp'],
    view: { showPoint: true, showHP: true, showVP: true, showCoord: true, showQuad: true, foldPose: 'unfolded' },
  },
  {
    id: 'pp-dist',
    railLabel: 'From PP',
    title: 'Distance from the profile plane',
    lead: 'One last position: how far along is the point, left to right?',
    body: [
      'Height and depth fix the point on the floor-and-wall grid, but not its side-to-side spot. The <button type="button" class="term" data-t="pp">Profile Plane</button> is a third wall on the side, at right angles to both the floor and the wall.',
      'Drag the slider to slide <b>P</b> sideways along the fold line. Distance from the profile plane is the third and final coordinate — now P is locked in place. Type an exact number into the field for precise work.',
    ],
    hint: 'Leave this at 0 for a point sitting right at the side wall. Any positive value just shifts P along the fold line.',
    spotlight: 'profile',
    controls: ['pp'],
    view: { showPoint: true, showHP: true, showVP: true, showCoord: true, showQuad: true, foldPose: 'unfolded' },
  },
  {
    id: 'unfold',
    railLabel: 'Unfold',
    title: 'Unfold into a drawing',
    lead: 'Paper is flat, but our room has a floor and a wall at right angles. So we flatten the room onto one sheet.',
    body: [
      'Treat the floor as a trapdoor hinged at the <button type="button" class="term" data-t="foldline">fold line</button>. Press <b>Animate Unfolding</b> and it swings down 90° until floor and wall lie flat in one plane — the same move as flattening a cardboard box.',
      'Now both shadows sit on one sheet: p′ above the line, p below it. That stacked layout is <button type="button" class="term" data-t="firstangle">first-angle projection</button>. Open <b>Compare</b> to see the finished 2D drawing beside the 3D view.',
    ],
    hint: 'The straight-down distance from the point to the floor never changes as the trapdoor swings. Folding only moves where we draw the shadow, not how far it really is.',
    spotlight: 'unfold',
    controls: ['anim'],
    view: { showPoint: true, showHP: true, showVP: true, showCoord: true, showQuad: true },
    done: (sim) => sim.isFolded(),
    doneText: 'Unfolded — the 2D drawing is complete.',
  },
]);

/** Convenience: total number of steps. */
export const STEP_COUNT = STEPS.length;
