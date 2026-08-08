// Guided-stepper copy + the Step-4 construction phases — Module 4, Topic 2.
//
// Pure data (the Module-1 `steps.js` / Topic-1 `isoSteps.js` pattern). Two tables live here:
//
//   STEPS   the six-step rail + card chrome text (title + one-sentence lead). Each step's BODY copy
//           — its explanation, its controls, its inline `.term` popovers — lives in the matching
//           `.step-panel[data-step]` in index.html, so the two never fight over ownership.
//
//   PHASES  Step 4's four construction phases (A–D). This is the topic's own idea: the construction
//           is not one animation but a sequence the learner ADVANCES, so the process is what is
//           remembered rather than the result.
//
// TEACHING SCOPE (task brief). This topic teaches the construction METHOD and nothing else. It does
// not solve textbook problems, and it deliberately carries NO hidden-line conventions, NO sectioning,
// NO auxiliary views, NO inclination or rotation problems, NO intersections, and NO dimensioning
// rules. Where a construction genuinely produces a hidden edge (the far corner of a prism), the copy
// names that it would be drawn hidden on a finished sheet and moves on — it does not teach the
// convention. Topic 1 answered "what IS an isometric drawing?"; this one answers "how is one BUILT?".
//
// Layering (CLAUDE.md): leaf data module, imports nothing. `stepper.js` imports STEPS; `main.js`
// imports PHASES.

/**
 * @typedef {Object} Step
 * @property {number} n
 * @property {string} title
 * @property {string} lead
 */

/** @type {Step[]} */
export const STEPS = [
  {
    n: 1,
    title: 'Choose a Solid',
    lead: 'Pick the solid you want to construct. Turn it in the viewport and get a feel for its shape before any line is drawn.',
  },
  {
    n: 2,
    title: 'Set the Dimensions',
    lead: 'Give the solid its real sizes. These few numbers are the only measurements the whole construction will ever use.',
  },
  {
    n: 3,
    title: 'Read the Orthographic Views',
    lead: 'Three flat views describe the solid completely — and they are where every dimension of the isometric drawing comes from.',
  },
  {
    n: 4,
    title: 'Construct the Isometric Drawing',
    lead: 'Axes first, then the enclosing box, then the shape inside it, then the finished drawing. Advance one phase at a time.',
  },
  {
    n: 5,
    title: 'Projection or View?',
    lead: 'The same construction, twice. Only the numbers you measure along the axes change — never the method.',
  },
  {
    n: 6,
    title: 'The Whole Process',
    lead: 'Watch the complete chain once more, end to end: views, axes, box, construction, finished drawing.',
  },
];

/**
 * Step 4's construction phases.
 *
 * Order is the whole lesson: an isometric drawing is not sketched freehand and it is not started at
 * the shape. It is started at the AXES (which fix the three directions), extended into the BOUNDING
 * BOX (which fixes the overall size, taken from the orthographic views), and only then is the shape
 * constructed inside that box and the guides cleared away. A learner who internalises that order can
 * construct a solid they have never seen; a learner who memorised a cube cannot.
 *
 * @typedef {Object} Phase
 * @property {'a'|'b'|'c'|'d'} id
 * @property {string} letter    The phase letter shown on its button.
 * @property {string} label     Button text.
 * @property {string} title     Headline shown in the card while the phase is live.
 * @property {string} note      The tutor's sentence for this phase.
 * @property {string} announce  Screen-reader narration.
 */

/** @type {Phase[]} */
export const PHASES = [
  {
    id: 'a',
    letter: 'A',
    label: 'Draw the axes',
    title: 'Phase A — Isometric axes',
    note: 'Every isometric drawing begins from three axes meeting at one point: one drawn VERTICAL, '
      + 'and two receding to either side at 30° to the horizontal. Those two angles are marked on the '
      + 'drawing itself, measured off the dashed horizontal through the corner — which is why the '
      + 'receding pair are called the 30° axes. Nothing is measured anywhere else on the sheet: every '
      + 'length in the drawing is set off along one of these three directions.',
    announce: 'Phase A. The three isometric axes are drawn from a single corner: one vertical, two '
      + 'receding at 30 degrees, each marked with its angle against the horizontal.',
  },
  {
    id: 'b',
    letter: 'B',
    label: 'Build the box',
    title: 'Phase B — Bounding box',
    note: 'Now transfer the three overall sizes onto those axes: the overall width from the front '
      + 'view, the overall depth from the top view, the overall height from the side view. Watch each '
      + 'one leave the view it is read from and travel to the edge it is set off along — that journey '
      + 'is the whole of what "transfer a dimension" means. Completing the box from those three '
      + 'lengths gives you the exact space the solid occupies, before you have drawn a single line of '
      + 'the solid itself.',
    announce: 'Phase B. Overall width, depth and height are transferred from the orthographic views '
      + 'onto the three axes, and the enclosing box is completed.',
  },
  {
    id: 'c',
    letter: 'C',
    label: 'Construct the shape',
    title: 'Phase C — Construct the shape',
    note: 'With the box standing, the solid is constructed INSIDE it. What that takes depends on the '
      + 'solid — a base outline repeated at height, a pair of ellipses, a base and an apex — but the '
      + 'box is what makes each of those placements exact rather than judged by eye.',
    announce: 'Phase C. The shape is constructed inside the bounding box.',
  },
  {
    id: 'd',
    letter: 'D',
    label: 'Finish the drawing',
    title: 'Phase D — Finish the drawing',
    note: 'Finally the construction lines fade back and the visible edges are darkened in. The box and '
      + 'the axes did their work and leave; what remains is the finished isometric drawing of exactly '
      + 'the solid the three orthographic views described.',
    announce: 'Phase D. The construction lines fade and the finished isometric drawing remains.',
  },
];

/** Look up a phase by id, falling back to the first so a bad id can never blank the step. */
export function getPhase(id) {
  return PHASES.find((p) => p.id === id) ?? PHASES[0];
}
