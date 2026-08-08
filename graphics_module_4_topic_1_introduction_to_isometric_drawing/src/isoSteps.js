// Guided-stepper copy — Module 4, Topic 1: Introduction to Isometric Drawing.
//
// Pure data (the Module-1 `steps.js` pattern): the ordered step sequence that drives the
// numbered rail + the card header (title + one-sentence lead). The BODY copy of each step —
// its explanation, its single action button, its inline `.term` popovers — lives in the
// matching `.step-panel[data-step]` in index.html; this file owns only the rail/card chrome
// text so the two never fight over ownership.
//
// This topic builds a MENTAL MODEL, not a procedure. Each step answers exactly one question
// (PRODUCT.md §1 "one idea per step"): why another drawing method, what orthographic is, why a
// single 3D picture reads faster, what the isometric position is, that two forms exist, and how
// the two representations connect. It deliberately teaches NO angles, NO isometric scale, and NO
// construction — those belong to the later topics this one sets up.
//
// Layering (CLAUDE.md): leaf data module, imports nothing. src/stepper.js imports STEPS.

/**
 * @typedef {Object} Step
 * @property {number} n      1-based step number (matches data-step in the markup).
 * @property {string} title  The card headline — the tutor's name for this idea.
 * @property {string} lead   One plain-spoken sentence under the title.
 */

/** @type {Step[]} */
export const STEPS = [
  {
    n: 1,
    title: 'Why Do We Need Another Drawing Method?',
    lead: 'Look at this solid from the front alone — it is a plain triangle. Can you identify the complete object from that?',
  },
  {
    n: 2,
    title: 'Orthographic Projection',
    lead: 'Look from the front, from above, and from the side — the same pyramid projects a different shape each time.',
  },
  {
    n: 3,
    title: 'Visualizing Objects',
    lead: 'Separate views are exact, but a single 3D-looking picture is far quicker to grasp at a glance.',
  },
  {
    n: 4,
    title: 'Isometric Drawing',
    lead: 'Turn the view to a special position where one picture shows the whole object — a three-dimensional shape drawn on a flat sheet.',
  },
  {
    n: 5,
    title: 'Two Types of Isometric Drawing',
    lead: 'Isometric Drawing is an umbrella term — it comes in two forms you will meet next.',
  },
  {
    n: 6,
    title: 'Connecting Orthographic and Isometric',
    lead: 'Watch the orthographic views become an isometric drawing — every size comes straight from those views.',
  },
];
