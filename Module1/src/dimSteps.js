// dimSteps.js — pure data layer for the Dimensioning lesson.
// No Three.js, no DOM nodes: the teaching sequence + the inline term glossary the
// shared engine (src/engine.js) renders into the step card and term popovers.
//
// Re-homes the "Dimensioning Techniques" section of the old scrolling index.html —
// the four rules, the aligned vs unidirectional systems, and the outside-vs-through
// mini-challenge — onto the SAME machine part the Line-types lesson uses (the part is
// always dimensioned here). Interactive state (dimMode, challenge choice) lives in
// the data object so the engine's rebuild() re-renders; the steps only set which
// controls + view appear. Bodies are authored HTML (trusted) so they can embed
// <button class="term"> definitions.
//
// Each step declares:
//   id, title, lead, body[]  — the tutor copy
//   hint                     — accent-wash callout
//   controls                 — revealed controls: 'dimmode' | 'challenge'
//   view                     — flags consumed by dimensioning.js draw3D, merged over
//                              defaultView { showDim, showDimMode, showChallenge }
//   orbitHint                — show the one-time "drag to rotate" chip

export const TERMS = Object.freeze({
  dimline: {
    label: 'dimension line',
    def: 'Dimension line — a thin continuous line, capped with arrowheads, that carries the size figure between two extension lines.',
  },
  extline: {
    label: 'extension line',
    def: 'Extension line — a thin line projecting from the feature so the dimension line can sit clear of the object outline (about 3 mm beyond it).',
  },
  figure: {
    label: 'dimension figure',
    def: 'Dimension figure — the number itself, always in millimetres in BIS practice, placed near the middle of the dimension line.',
  },
  aligned: {
    label: 'aligned system',
    def: 'Aligned system — figures are placed parallel to their dimension line and read from the bottom or the right-hand edge of the sheet. Common in Indian practice.',
  },
  uni: {
    label: 'unidirectional system',
    def: 'Unidirectional system — every figure is written horizontally and read from the bottom of the sheet, whatever the dimension line’s direction. Preferred in CAD.',
  },
  sp46: {
    label: 'SP 46:2003',
    def: 'The BIS code of practice for engineering drawing. It fixes how dimensions are written and placed, so a part is made the same way in any workshop.',
  },
});

export const STEPS = Object.freeze([
  {
    id: 'elements',
    title: 'Three parts of a dimension',
    lead: 'A drawing without dimensions is just a picture. Every dimension is built from three pieces.',
    body: [
      'Each dimension on this part is a <button type="button" class="term" data-t="dimline">dimension line</button> ended with arrowheads, two thin <button type="button" class="term" data-t="extline">extension lines</button> that carry it clear of the outline, and the <button type="button" class="term" data-t="figure">dimension figure</button> — the size in millimetres.',
      'Notice the dimension and extension lines are the lightest <b>continuous thin</b> linework, so they annotate the part without competing with its visible edges. Orbit to keep the figures facing you.',
    ],
    hint: 'Extension lines start a small gap from the object and run about 3 mm past the dimension line.',
    controls: [],
    view: { showDim: true },
    orbitHint: true,
  },
  {
    id: 'systems',
    title: 'Aligned vs unidirectional',
    lead: 'There are two accepted ways to orient the figures. Switch between them and watch the height value turn.',
    body: [
      'In the <button type="button" class="term" data-t="aligned">aligned system</button>, each figure lies parallel to its own dimension line — so the vertical height reads up the side of the sheet. In the <button type="button" class="term" data-t="uni">unidirectional system</button>, every figure stays horizontal and reads from the bottom.',
      'Toggle the two systems below. Only the orientation of the figures changes; the lines and sizes stay identical. Aligned is common on Indian boards; unidirectional suits CAD.',
    ],
    hint: 'Aligned: read from the bottom or the right edge. Unidirectional: always read from the bottom.',
    controls: ['dimmode'],
    view: { showDim: true, showDimMode: true },
  },
  {
    id: 'rules',
    title: 'Four rules that never bend',
    lead: 'A handful of conventions keep every dimensioned drawing unambiguous.',
    body: [
      'Dimension in <b>millimetres</b> and never write the unit on each figure. <b>Never repeat</b> a dimension — give every size once. Keep dimension lines at least <b>8 mm</b> clear of the object outline, and never let a dimension line cross the body of the part.',
      'These come straight from <button type="button" class="term" data-t="sp46">SP 46:2003</button>. The last one — keeping dimensions outside the object — is the rule the quick-check tests next.',
    ],
    hint: 'Millimetres · never repeat a size · keep dimension lines ≥ 8 mm clear · never run them through the part.',
    controls: [],
    view: { showDim: true },
  },
  {
    id: 'challenge',
    title: 'Quick check — outside or through?',
    lead: 'One width dimension, two placements. Pick the one a drawing office would accept.',
    body: [
      'The part needs its <b>80 mm</b> width dimensioned. Should the dimension line sit <b>outside</b> the part on extension lines, or run straight <b>through</b> the body?',
      'Choose an option below — the viewport will draw your choice, in green if it follows <button type="button" class="term" data-t="sp46">SP 46:2003</button> and in clay if it breaks it.',
    ],
    hint: 'A dimension line that crosses the object is ambiguous — the reader cannot tell the line from an edge.',
    controls: ['challenge'],
    view: { showDim: false, showChallenge: true },
  },
]);

export const STEP_COUNT = STEPS.length;
