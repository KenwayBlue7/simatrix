// LabelStyles.js — the STYLE table for the 3D label system. Styling ONLY: it maps each label TYPE to
// the CSS class set the factory stamps on the DOM node. No placement, no scene, no positions.
//
// Every class is a platform engineering-tag class defined in index.html (`.lbl` base + `.lbl--chip`
// box + the `.lbl--hp / --vp / --ink` hue tokens + the `.lbl--xy` axis mark) — the same family the
// Points reference uses (DESIGN.md §5.9, RULES.md §4.1). Colours/fonts therefore resolve from CSS
// custom properties at paint time; nothing is hard-coded here.
//
// Single responsibility: STYLES. Consumed only by LabelFactory.js.

/** The complete, closed set of 3D label types (STEP 4 — exactly these, nothing else). */
export const LabelType = Object.freeze({
  HP: 'HP', VP: 'VP', X: 'X', Y: 'Y',
  A: 'A', B: 'B', a: 'a', b: 'b', aPrime: 'aPrime', bPrime: 'bPrime',
  THETA: 'THETA', PHI: 'PHI',
});

// className building blocks (index.html classes).
const HP_PLAIN = 'lbl lbl--hp';            // teal, no box (plane callout / θ)
const VP_PLAIN = 'lbl lbl--vp';            // amber, no box (plane callout / φ)
const INK_CHIP = 'lbl lbl--chip lbl--ink'; // boxed ink vertex tag (space endpoints A/B)
const HP_CHIP  = 'lbl lbl--chip lbl--hp';  // boxed teal tag  (top-view feet a/b)
const VP_CHIP  = 'lbl lbl--chip lbl--vp';  // boxed amber tag (front-view feet a′/b′)
const AXIS     = 'lbl lbl--xy';            // ink axis end mark (x/y)

/** type → { className }. The ONLY place a 3D label's visual class is decided. */
export const STYLE = Object.freeze({
  [LabelType.HP]:     { className: HP_PLAIN },
  [LabelType.VP]:     { className: VP_PLAIN },
  [LabelType.X]:      { className: AXIS },
  [LabelType.Y]:      { className: AXIS },
  [LabelType.A]:      { className: INK_CHIP },
  [LabelType.B]:      { className: INK_CHIP },
  [LabelType.a]:      { className: HP_CHIP },
  [LabelType.b]:      { className: HP_CHIP },
  [LabelType.aPrime]: { className: VP_CHIP },
  [LabelType.bPrime]: { className: VP_CHIP },
  [LabelType.THETA]:  { className: HP_PLAIN },
  [LabelType.PHI]:    { className: VP_PLAIN },
});

// NOTE — the TL value is NOT a member of this system. It is the Type-B DIMENSION's own value label,
// created + styled by the untouched dimensions.js (STEP 5: "TL belongs to the dimension object"). Its
// standoff constant lives in LabelPlacement.js (DIMENSION_OFFSET) so there is still ONE source for the
// number, but this style table intentionally omits it.
