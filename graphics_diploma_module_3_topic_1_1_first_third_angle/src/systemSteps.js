// systemSteps.js — pure data layer for the guided sequence (First & Third Angle
// Projection). No THREE, no DOM. stepper.js renders these into the step card and
// rail; main.js consumes the view flags through simController.applyView().
//
// Each step declares:
//   id, title, lead, body[], hint (optional)
//   controls  — revealed controls: 'system-toggle' | 'fold'
//   view      — viewport flags merged over DEFAULT_VIEW by simController.applyView()
//   done      — optional (sim) => boolean completion gate

/** Term glossary. Keys match data-t="…" on term buttons in step copy. */
export const TERMS = Object.freeze({
  hp: { label: 'HP', def: 'Horizontal Plane — the reference plane you picture lying flat like a tabletop. The top view lands on it.' },
  vp: { label: 'VP', def: 'Vertical Plane — the reference plane standing up like a wall. The front view (elevation) lands on it — and it is the plane of the finished drawing sheet.' },
  pp: { label: 'PP', def: 'Profile Plane — the reference plane at the side of the object. The side view lands on it.' },
  glassbox: { label: 'glass box', def: 'Imagine the object enclosed in a transparent box whose walls are the reference planes — each view is what you would see projected onto the wall facing you.' },
  rabatment: { label: 'rabattement', def: 'Rabattement — rotating a reference plane about its fold line until it lies flat in the plane of another, turning a 3D layout into a flat drawing.' },
  firstangle: { label: 'first-angle projection', def: 'First-angle projection — the object sits between the observer and the plane for every view (EYE, OBJECT, PLANE). The BIS/Indian standard default.' },
  thirdangle: { label: 'third-angle projection', def: 'Third-angle projection — the plane sits between the observer and the object for every view (EYE, PLANE, OBJECT). Must be explicitly stated on a drawing — it is never assumed.' },
  bissymbol: { label: 'BIS symbol', def: 'A small truncated-cone symbol in the title block that tells any engineer, at a glance, which projection system a drawing uses — first-angle or its mirror, third-angle.' },
});

export const DEFAULT_VIEW = Object.freeze({
  showHP: false,
  showVP: false,
  showPP: false,
  showSolid: false,
  showProjectors: false,
  showViews: false,      // the three projected-rectangle outlines
  showSymbol: false,     // the BIS badge
  shape: 'box',          // 'box' | 'frustum' — which solid solidViews.js builds
  system: null,          // when set, PINS the system for this step (else the learner's own toggle)
  foldPose: null,        // 'open' | 'folded' | null (null = leave as-is)
});

export const STEPS = Object.freeze([
  {
    id: 'planes',
    title: 'The Three Reference Planes',
    lead: 'Every orthographic drawing starts with three planes meeting at a corner.',
    body: [
      'Orbit the scene. The teal floor is the <button type="button" class="term" data-t="hp">HP</button> — Horizontal Plane. The amber wall is the <button type="button" class="term" data-t="vp">VP</button> — Vertical Plane. The third plane at the side is the <button type="button" class="term" data-t="pp">PP</button> — Profile Plane.',
      'Together the three planes form a <button type="button" class="term" data-t="glassbox">glass box</button> corner. Every view you will ever draw is what lands on one of these three walls.',
    ],
    hint: 'This topic teaches only this one corner — the full six-view box comes later.',
    controls: [],
    view: { showHP: true, showVP: true, showPP: true, foldPose: 'open' },
  },
  {
    id: 'first-setup',
    title: 'First-Angle Setup',
    lead: 'Place the object between you and each plane.',
    body: [
      'In <button type="button" class="term" data-t="firstangle">first-angle projection</button> the rule is the same for every view: EYE, then OBJECT, then PLANE. You look at the object, and its shadow falls on the plane beyond it.',
      'Watch the three dashed projector groups: straight down to HP (the top view), straight back to VP (the front view), straight across to PP (the side view).',
      'The arrow labelled <b>F</b> beyond the object marks the direction you are looking to get the FRONT view — the same "arrow F" convention a pictorial sketch on paper uses.',
    ],
    hint: 'First-angle is the BIS/Indian default — used unless a drawing explicitly says otherwise.',
    controls: [],
    view: { showHP: true, showVP: true, showPP: true, showSolid: true, showProjectors: true, showViews: true, system: 'first', foldPose: 'open' },
  },
  {
    id: 'first-fold',
    title: 'First-Angle Fold',
    lead: 'Fold HP and PP flat against VP — the trapdoor swings shut.',
    body: [
      'Press <b>Fold planes flat</b>. HP and PP each perform a <button type="button" class="term" data-t="rabatment">rabattement</button>, hinging until they lie flat in the plane of the drawing sheet (VP).',
      'Read the result: the top view lands <b>below</b> the front view; the side view lands <b>to the right</b> of it. This is the first-angle layout, and the <button type="button" class="term" data-t="bissymbol">BIS symbol</button> below confirms it.',
    ],
    hint: 'The front view never moves — it already sits on VP, the plane that becomes the drawing sheet.',
    controls: ['fold'],
    view: { showHP: true, showVP: true, showPP: true, showSolid: true, showViews: true, showSymbol: true, system: 'first' },
    // isFolded() is one GLOBAL flag shared with the third-angle fold step below — also
    // requiring the pinned system prevents this step from reading "done" the moment the
    // OTHER fold step is folded (which would falsely rail-check this step and let a
    // direct rail-jump skip the other setup step's auto-unfold entirely).
    done: (sim) => sim.isFolded() && sim.getSystem() === 'first',
  },
  {
    id: 'third-setup',
    title: 'Third-Angle Setup',
    lead: 'Now place the same object in the third quadrant — the planes come between you and it.',
    body: [
      'In <button type="button" class="term" data-t="thirdangle">third-angle projection</button> the rule flips: EYE, then PLANE, then OBJECT. The plane sits between you and the object — imagine looking through transparent glass at what is beyond it.',
      'Same object, same dimensions — only its position relative to the planes has changed. Watch how the projector groups now run the other way.',
    ],
    hint: 'Third-angle must always be stated explicitly on a drawing — it is never the assumed default.',
    controls: [],
    view: { showHP: true, showVP: true, showPP: true, showSolid: true, showProjectors: true, showViews: true, system: 'third', foldPose: 'open' },
  },
  {
    id: 'third-fold',
    title: 'Third-Angle Fold',
    lead: 'Fold the planes again — the same motion, the opposite result.',
    body: [
      'Press <b>Fold planes flat</b> again. Same rabattement, same 90° swing — but because the object sits in the opposite corner, the result flips.',
      'Read it: the top view now lands <b>above</b> the front view; the side view lands <b>to the left</b> of it. The BIS symbol below is the mirror image of first-angle\'s.',
    ],
    hint: 'Nothing about the FOLD changed — only where the object sat before you folded.',
    controls: ['fold'],
    view: { showHP: true, showVP: true, showPP: true, showSolid: true, showViews: true, showSymbol: true, system: 'third' },
    done: (sim) => sim.isFolded() && sim.getSystem() === 'third',
  },
  {
    id: 'compare',
    title: 'Compare',
    lead: 'The solid itself becomes a frustum — the one the BIS symbol is a picture of.',
    body: [
      'The object swaps to a truncated cone: its own top view is two concentric circles, and its front and side views are both the SAME trapezoid (a frustum looks identical from any side). That trapezoid-and-circles pair is exactly the badge below, at full size.',
      'Use the <b>First-angle / Third-angle</b> toggle below. Same solid, same dimensions — only the view positions and the badge change.',
      'Remember the default rule: BIS/India assumes first-angle unless a drawing states third-angle explicitly, usually right next to the symbol in the title block.',
    ],
    hint: 'If you ever forget which is which, the symbol is the fastest check: a first-angle cone points one way, third-angle the other.',
    controls: ['system-toggle'],
    view: { showHP: true, showVP: true, showPP: true, showSolid: true, showViews: true, showSymbol: true, shape: 'frustum' },
  },
  {
    id: 'verify',
    title: 'Verify',
    lead: 'A pictorial statement with an arrow F, and a target layout to match.',
    body: [
      'Practice problems below give you a pictorial statement with the front-view direction marked <b>F</b> — the same arrow you have been seeing beside the object. Set the toggle to the system asked for, then confirm the resulting view layout and symbol match.',
      'Nothing is auto-filled — dial the toggle yourself and read the result, the same way you would on paper.',
    ],
    hint: 'The self-check compares your toggle choice against the problem\'s target — try Practice problems above.',
    controls: ['system-toggle'],
    view: { showHP: true, showVP: true, showPP: true, showSolid: true, showViews: true, showSymbol: true },
  },
]);

export const STEP_COUNT = STEPS.length;
