// linetypeSteps.js — pure data layer for the Types-of-lines lesson.
// No Three.js, no DOM nodes: the teaching sequence + the inline term glossary the
// shared engine (src/engine.js) renders into the step card and term popovers.
//
// Re-homes the 5-row "Types of Lines" table from the old scrolling index.html (BIS
// SP 46:2003 — Type A / B / E-F / G / C) onto one machine part. The lesson is
// RAIL-DRIVEN with a CUMULATIVE reveal: each step switches another line type on
// (linetypes.js draw3D reads the view flags), so the part builds up the way a
// draughtsperson layers a drawing. Bodies are authored HTML (trusted) so they can
// embed <button class="term"> definitions.
//
// Each step declares:
//   id, title, lead, body[]  — the tutor copy (title / lead / body type)
//   hint                     — the table row's "Used for" note (accent-wash callout)
//   controls                 — [] (rail-driven; no sliders/toggles on this lesson)
//   view                     — flags consumed by linetypes.js draw3D, merged over
//                              defaultView { showVisible, showHidden, showCentre,
//                              showDim, focus }. `focus` names the line type just
//                              introduced, so the viewport captions it in its colour.
//   orbitHint                — show the one-time "drag to rotate" chip

export const TERMS = Object.freeze({
  visible: {
    label: 'visible edge',
    def: 'Visible edge — an outline or edge of the object you can actually see from this direction. Drawn as a continuous thick line (Type A).',
  },
  hidden: {
    label: 'hidden line',
    def: 'Hidden line — an edge that exists but is concealed behind material from this view, such as the far rim of a hole. Drawn as a medium dashed line (Type E/F).',
  },
  centre: {
    label: 'centre line',
    def: 'Centre line — a thin long-dash–dot chain line marking an axis of symmetry or the centre of a circle, such as the axis of a hole (Type G).',
  },
  through: {
    label: 'through-hole',
    def: 'Through-hole — a hole drilled completely through the part. Its near rim is a visible circle; its far rim is hidden.',
  },
  dimline: {
    label: 'dimension line',
    def: 'Dimension line — a thin continuous line, ended with arrowheads, carrying the size figure between two extension lines (Type B).',
  },
  extline: {
    label: 'extension line',
    def: 'Extension line — a thin continuous line projecting out from the feature so the dimension line can sit clear of the object (Type B).',
  },
  bis: {
    label: 'BIS SP 46:2003',
    def: 'The Bureau of Indian Standards code of practice for engineering drawing. It fixes which line type means what, so a drawing reads the same in every workshop.',
  },
});

export const STEPS = Object.freeze([
  {
    id: 'visible',
    title: 'Continuous thick — visible edges',
    lead: 'Every drawing starts with the edges you can actually see. They are drawn boldest of all.',
    body: [
      'This is a small plate with a <button type="button" class="term" data-t="through">through-hole</button>. Its <button type="button" class="term" data-t="visible">visible edges</button> — the outlines you can see from this direction, plus the near rim of the hole — are drawn as <b>continuous thick</b> lines (<b>Type A</b>).',
      'Thickness is the cue: visible edges are the heaviest line on the sheet, so the shape of the part reads at a glance. Orbit the part to see the edges from any side.',
    ],
    hint: 'Used for visible edges of machine components, castings, and structural outlines.',
    controls: [],
    view: { showVisible: true, focus: 'visible' },
    orbitHint: true,
  },
  {
    id: 'hidden',
    title: 'Dashed — hidden edges',
    lead: 'Edges that are really there but blocked from view are not dropped — they are dashed.',
    body: [
      'The hole’s <b>far rim</b> and its bore are behind solid material from this side, so they are <button type="button" class="term" data-t="hidden">hidden lines</button> — drawn as a <b>medium dashed</b> line (<b>Type E/F</b>). The near rim stayed thick and solid.',
      'Orbit until the dashed circle sits behind the front face: dashes tell the reader “this edge exists, but you cannot see it from here.”',
    ],
    hint: 'Used for internal bores, blind holes, and features hidden behind a surface.',
    controls: [],
    view: { showVisible: true, showHidden: true, focus: 'hidden' },
  },
  {
    id: 'centre',
    title: 'Chain thin — centre lines',
    lead: 'Round features need their axis marked. That is the job of the thin chain line.',
    body: [
      'A thin <button type="button" class="term" data-t="centre">centre line</button> — a <b>long-dash · dot · long-dash</b> chain (<b>Type G</b>) — runs along the hole’s axis and crosses its centre on the front face.',
      'Centre lines locate axes of symmetry and circle centres without adding more outline, so a fitter knows exactly where the hole is bored.',
    ],
    hint: 'Used for shaft axes, bolt-circle centres, pitch circles, and symmetry lines.',
    controls: [],
    view: { showVisible: true, showHidden: true, showCentre: true, focus: 'centre' },
  },
  {
    id: 'dim',
    title: 'Continuous thin — dimension lines',
    lead: 'Sizes are added with the lightest continuous line, so they never fight the outline.',
    body: [
      'The size figures sit on <button type="button" class="term" data-t="dimline">dimension lines</button> carried clear of the part by thin <button type="button" class="term" data-t="extline">extension lines</button> — all <b>continuous thin</b> (<b>Type B</b>). Same continuous stroke as a visible edge, but far lighter.',
      'Weight, not colour, separates the layers: thick = shape, dashed = hidden, chain = axis, thin = annotation. That hierarchy is fixed by <button type="button" class="term" data-t="bis">BIS SP 46:2003</button>.',
    ],
    hint: 'Used for dimension lines, extension lines, projection lines, and leader lines.',
    controls: [],
    view: { showVisible: true, showHidden: true, showCentre: true, showDim: true, focus: 'dim' },
  },
  {
    id: 'all',
    title: 'The full line alphabet',
    lead: 'Read together, the four line types let one flat drawing carry the whole part.',
    body: [
      'Thick visible edges, dashed hidden edges, the chain centre line, and thin dimension lines now share one part — each saying something different by its <b>weight and dash pattern</b> alone.',
      'One more you will meet on long parts: <b>Type C</b>, a continuous thin <i>freehand</i> line used for short <b>break lines</b> — where a long shaft or beam is drawn cut short to save space. The same alphabet scales to any drawing in this course.',
    ],
    hint: 'Type C — short break lines for partial sections on long components such as shafts and beams.',
    controls: [],
    view: { showVisible: true, showHidden: true, showCentre: true, showDim: true, focus: null },
  },
]);

export const STEP_COUNT = STEPS.length;
