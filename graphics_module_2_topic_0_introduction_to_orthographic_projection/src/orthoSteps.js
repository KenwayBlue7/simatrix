// Step copy — Module 2, Topic 0: Introduction to Orthographic Projection.
//
// TWO steps, and two is the whole topic. This is the FIRST thing a student meets in Module 2, so it
// answers exactly two questions and stops: "what is a view?" and "how does a drawing get made from
// one?" Everything else in the module — inclined solids, sections, auxiliary views — needs both of
// those answered first and neither of them re-explained.
//
// Layering (CLAUDE.md, RULES.md §3.6a): leaf DATA module. Imports nothing.

export const STEPS = Object.freeze([
  {
    title: 'Look at the Object',
    lead: 'Turn it, then look at it from each of the four directions in turn. A view is not a '
      + 'picture of the object — it is what the object looks like from ONE place to stand. That is '
      + 'why one view is never enough to describe a shape.',
    nextLabel: 'Start Projection',
  },
  {
    title: 'Build the Drawing',
    lead: 'The same object, now drawn on paper. Front view, then top view, then the side view you '
      + 'choose — each one built in the same four moves, and each one measured off the one before.',
  },
]);

/**
 * The order Step 2 builds the drawing in, and why it is that order.
 *
 * This is copy, not control flow: the stage list the sheet actually plays is DERIVED from the
 * linework each view carries (projectionSheet.js), so an object with no hidden detail in its
 * elevation simply has no hidden stage there. Nothing here indexes into that list.
 */
export const BUILD_ORDER = Object.freeze([
  {
    view: 'front',
    title: 'Front view',
    why: 'The front view comes first because every other view is measured from it. It is the view '
      + 'taken along the blue arrow, and it should be the one that shows the shape best.',
  },
  {
    view: 'top',
    title: 'Top view',
    why: 'The top view is dropped straight DOWN from the front view, so its length never has to be '
      + 'measured again. It goes underneath, and the face nearest you ends up at the bottom.',
  },
  {
    view: 'side',
    title: 'Side view',
    why: 'Heights come across from the front view; depths come round from the top view through the '
      + '45° line. The view from the RIGHT is drawn on the LEFT, and the view from the LEFT is '
      + 'drawn on the RIGHT — opposite, always.',
  },
]);

/** The four moves every view is built in. Copy for Step 2's legend; the sheet owns the linework. */
export const LAYER_LEGEND = Object.freeze([
  { layer: 'construction', name: 'Building lines', body: 'Thin, and only there to line the views up. They fade once they have done their job.' },
  { layer: 'outline', name: 'Outline', body: 'Thick and solid — the edges you could really see from this direction.' },
  { layer: 'hidden', name: 'Hidden edges', body: 'Short dashes for edges buried inside the material. Without them nobody can tell there is a hole there.' },
  { layer: 'centre', name: 'Centre lines', body: 'A long chain through anything round: "this is round, and this is the middle".' },
]);
