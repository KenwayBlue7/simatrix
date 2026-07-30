// Lesson copy + glossary (Module 1 Topic 1.1 — Dimensioning).
//
// PURE DATA LEAF (ADR-007 / RULES.md §3.6): imports nothing, owns no DOM. `dimensionUI.js`
// paints it; the inline <button class="term" data-t="…"> triggers inside the prose look
// their definitions up in TERMS.
//
// VOICE. This is a teacher, not a textbook. Everything here is said the way you would say it
// out loud to a first-year student: short sentences, ordinary words, no clause stacking. The
// engineering is never softened — only the wording is.
//
// NO CITATIONS. There are deliberately no section numbers, rule numbers or figure numbers in
// any learner-facing string. A student does not need to know where a rule came from to obey
// it, and a reference in the middle of a sentence is a speed bump. The rules themselves are
// unchanged and remain traceable through the source comments, which are for us, not them.
//
// LENGTH. Two to four short sentences, or three to five short bullets. If an interaction can
// show it, the text does not explain it in advance.

/**
 * Glossary for the inline term triggers. Key = the `data-t` id on the button.
 * Two or three short sentences each — a definition, not an essay.
 * @type {Record<string, { label: string, def: string }>}
 */
export const TERMS = {
  dimensioning: {
    label: 'dimensioning',
    def: 'Adding sizes to a drawing, using lines, symbols and short notes. It tells the workshop how big the part is and where its features go.',
  },
  sizedesc: {
    label: 'size description',
    def: 'Everything a shape cannot show: sizes and their allowed error, where the holes go, how smooth a face must be, what the part is made of and how many are wanted. Dimensions are the first part of it.',
  },
  projline: {
    label: 'projection line',
    def: 'A thin line that carries an edge of the part out to where the measurement can be written. It starts right on the feature and runs a little past the dimension line.',
  },
  dimline: {
    label: 'dimension line',
    def: 'The thin line that spans the distance being measured, with an arrow at each end. It is never one of the part\'s own lines.',
  },
  leader: {
    label: 'leader line',
    def: 'A thin line that points at a feature and carries a note to it. The note sits on a short horizontal bar at the far end.',
  },
  termination: {
    label: 'termination',
    def: 'How a dimension line ends: an arrow head, a short slanted stroke, or a dot. Pick one style and use it everywhere on the drawing.',
  },
  dimtext: {
    label: 'the value',
    def: 'The number itself, small and just clear of its line. Sizes are in millimetres, so you never write "mm" after them.',
  },
  note: {
    label: 'note',
    def: 'A few words a dimension line cannot carry — a chamfer, a countersink, a material. A leader takes it to the feature it belongs to.',
  },
  linetype: {
    label: 'line types',
    def: 'A drawing has four line weights and each one means something. Thick for edges you can see, thin for everything to do with dimensions, dashed for edges hidden behind the part, and chain for the middle of round features.',
  },
  method1: {
    label: 'aligned values',
    def: 'The value lies along its own dimension line and turns with it, always staying readable from the bottom or the right of the sheet.',
  },
  method2: {
    label: 'upright values',
    def: 'Every value is written level, read from the bottom of the sheet. On a sloping or vertical line it breaks the line and sits in the gap.',
  },
  chain: {
    label: 'chain',
    def: 'Measurements laid end to end, each one from the last. Compact — but small errors add up along the chain, so use it only where that cannot matter.',
  },
  parallel: {
    label: 'parallel',
    def: 'Every measurement taken from the same edge, on its own line. Costs space, but no errors build up.',
  },
  running: {
    label: 'running',
    def: 'Parallel measurements squeezed onto one line. Mark where they start, and put the only arrow at the far end of each.',
  },
  coordinate: {
    label: 'co-ordinates',
    def: 'No dimension lines at all. Number each feature and list its across-and-up position in a table beside the view.',
  },
  datum: {
    label: 'datum',
    def: 'The one edge or face everything is measured from. Parallel, running and co-ordinate dimensioning all work from one.',
  },
  tolerance: {
    label: 'errors adding up',
    def: 'Every size is allowed a little error. In a chain each one is measured from the last, so the errors stack — the far end can drift well off.',
  },
  chamfer: {
    label: 'chamfer',
    def: 'A corner cut off flat. Give its length and its angle; at 45° you can write both in one note, like 10 × 45°.',
  },
  countersink: {
    label: 'countersink',
    def: 'A cone widening the mouth of a hole so a screw head sits flush. Give the angle of the cone with either its width or its depth.',
  },
  fillet: {
    label: 'fillet',
    def: 'The rounded inside corner where two faces meet. Dimension it as a radius, with one arrow landing on the curve.',
  },
  scale: {
    label: 'scale',
    def: 'Drawings are usually full size. Draw bigger or smaller if you must — but always write the part\'s REAL size on the dimension line, never the drawn one.',
  },
  caption: {
    label: 'caption',
    def: 'The name of the part in capitals under the drawing, with the scale beside it.',
  },
  hatching: {
    label: 'hatching',
    def: 'The evenly spaced thin lines that fill a cut face in a section. If a value has to sit in one, break the hatching around it.',
  },
};

/**
 * The line alphabet, as Step 1's legend shows it: name, weight, one line on what it means.
 * Clicking one holds it on the drawing and fades the rest — which is where the real teaching
 * happens, so the copy stays out of the way.
 * @type {Array<{ id:string, name:string, type:string, use:string }>}
 */
export const LINE_TYPES = Object.freeze([
  { id: 'visible', name: 'Visible edge', type: 'Thick line', use: 'The part you can see. Arrow heads are drawn thick too.' },
  { id: 'apparatus', name: 'Dimensioning', type: 'Thin line', use: 'Everything that measures: projection, dimension and leader lines.' },
  { id: 'hidden', name: 'Hidden edge', type: 'Dashed line', use: 'An edge behind the surface. Never measure from one.' },
  { id: 'centre', name: 'Centre line', type: 'Chain line', use: 'The middle of a hole or a round feature.' },
]);

/**
 * The six guided steps.
 *
 * COPY SHAPE — the same triad the sibling Foundations topic uses, so a learner moving between
 * topics reads the same three headings in the same order:
 *
 *   body.open[0]      <b>What it is:</b>       one or two sentences
 *   body.open[1]      <b>Why we use it:</b>    one or two sentences
 *   body.open[2…]     (unlabelled)             what to do here — an instruction, never a heading
 *   body.postBody[0]  <b>How it is drawn:</b>  painted BELOW the controls, and withheld until
 *                                              those controls exist
 *
 * `summary` is the closing card — what to remember — shown only once the step is complete.
 *
 * @type {Array<{ n:number, title:string, rail:string, lead:string,
 *                body:{ open:string[], postBody:string[] },
 *                summary:{ title:string, points:string[] } }>}
 */
export const STEPS = [
  {
    n: 1,
    rail: 'Elements',
    title: 'What a dimension is made of',
    lead: 'A drawing shows SHAPE. Dimensions add SIZE.',
    body: {
      open: [
        `<b>What it is:</b> <button type="button" class="term" data-t="dimensioning">dimensioning</button> is how a drawing states sizes — with lines, symbols and short notes.`,
        `<b>Why we use it:</b> a view shows what the part looks like. It cannot say how big it is, or where the holes go.`,
        `The plate below is drawn but has no sizes yet. Add them and watch one being built, piece by piece.`,
      ],
      postBody: [
        `<b>How it is drawn:</b> every control here changes the drawing above. Try each one and watch what moves.`,
      ],
    },
    summary: {
      title: 'Remember',
      points: [
        'A dimension is five things: two projection lines, a dimension line, its ends, and the value.',
        'Measuring lines are thin. Only the part\'s edges and the arrow heads are thick.',
        'One style of arrow head per drawing.',
        'Too tight for arrows? Put them outside. Tighter still? Use dots.',
        'A leader\'s end depends on what it points at: a dot on a face, an arrow on an edge.',
      ],
    },
  },
  {
    n: 2,
    rail: 'Rules',
    title: 'Putting them in the right place',
    lead: 'Each rule stops a drawing being read two ways.',
    body: {
      open: [
        `<b>What it is:</b> a short list of rules about where each part of a dimension may go.`,
        `<b>Why we use it:</b> a drawing that can be read two ways will be made two ways.`,
        `Pick a rule, then switch between the two drawings and see what changes. Two of the cards show something you are ALLOWED to do — those switch between two correct drawings.`,
      ],
      postBody: [
        `<b>How it is drawn:</b> drag the highlighted value, or select it and use the arrow keys. The drawing will tell you if you put it somewhere it cannot go.`,
      ],
    },
    summary: {
      title: 'Remember',
      points: [
        'Projection lines start on the feature and run a little past the dimension line.',
        'Never use a centre line or an edge of the part AS a dimension line — but they may carry one out.',
        'Keep lines from crossing. Measure from edges you can see, never from dashed ones.',
        'A shortened drawing keeps its full dimension line, and its real size.',
        'Leave 5–6 mm of clear space around every dimension line.',
      ],
    },
  },
  {
    n: 3,
    rail: 'Values',
    title: 'Writing the values',
    lead: 'Two ways to place a number. Pick one and stay with it.',
    body: {
      open: [
        `<b>What it is:</b> values are written either <button type="button" class="term" data-t="method1">aligned</button> — lying along their own line — or <button type="button" class="term" data-t="method2">upright</button>, all level.`,
        `<b>Why we use it:</b> the reader has to know which way up a number will be before they start.`,
        `Switch between the two and watch every value on the plate change with you.`,
      ],
      postBody: [
        `<b>How it is drawn:</b> values are small — about 3 to 4 mm — and sit just clear above the line, not on it.`,
      ],
    },
    summary: {
      title: 'Remember',
      points: [
        'Aligned: the value lies along its line and turns with it, always read from the bottom or the right.',
        'Upright: every value stays level, and breaks a sloping or vertical line to sit in the gap.',
        'Angles can follow the curve, or simply be written level — level is easier.',
        'Never mix the two on one drawing.',
      ],
    },
  },
  {
    n: 4,
    rail: 'Arrange',
    title: 'Arranging the dimensions',
    lead: 'Same sizes, laid out five ways. Each costs something.',
    body: {
      open: [
        `<b>What it is:</b> the standard ways of laying dimensions out — end to end, side by side from one edge, a mix of both, stacked on one line, or moved off the drawing into a table.`,
        `<b>Why we use it:</b> the layout is chosen for the job, not for looks. One of them lets errors add up.`,
        `Pick a layout and watch the same features get re-measured.`,
      ],
      postBody: [
        `<b>How it is drawn:</b> hold two layouts side by side and judge them on space, clarity, and how the part will actually be made.`,
      ],
    },
    summary: {
      title: 'Remember',
      points: [
        'Chain — compact, but errors add up. Only where that cannot matter.',
        'Parallel — every size from one edge, no build-up, but it eats space.',
        'Combined — the everyday choice: parallel where it matters, chain where it does not.',
        'Running — parallel squeezed onto one line. Mark the start, arrow only the far end.',
        'Co-ordinates — no dimension lines; the numbers move to a table.',
      ],
    },
  },
  {
    n: 5,
    rail: 'Symbols',
    title: 'Shape symbols',
    lead: 'A symbol in front of a number says what shape it is.',
    body: {
      open: [
        `<b>What it is:</b> five symbols, written in front of the value — <b>ø</b> diameter, <b>R</b> radius, <b>Sø</b> ball diameter, <b>SR</b> ball radius, <b>□</b> square.`,
        `<b>Why we use it:</b> a bare number could be anything. ø40 can only be a diameter.`,
        `Pick a symbol and see it measure the real feature it belongs to. The four below are conventions, not symbols — worth knowing apart.`,
      ],
      postBody: [
        `<b>How it is drawn:</b> most features can be measured more than one way. Step through the forms and watch what each one costs.`,
      ],
    },
    summary: {
      title: 'Remember',
      points: [
        'Only five are real symbols: ø, R, Sø, SR, □.',
        'The symbol goes FIRST, tight against the number: R12, not 12R. Never "12 Dia" or "D12".',
        'You may drop ø across a circle, where the line already shows what it spans. Never on a leader.',
        'A radius gets ONE arrow, landing on the curve.',
        'A cylinder drawn as a rectangle still needs ø — nothing else says it is round.',
      ],
    },
  },
  {
    n: 6,
    rail: 'Review',
    title: 'Read the drawing — and find the mistakes',
    lead: 'The plate is fully dimensioned. Some of it is wrong.',
    body: {
      // Deliberately shorter than the teaching steps. This one is the assessment: the learner
      // is here to look at the drawing, not to read the panel, so the copy states the task and
      // gets out of the way. The marker glyphs and the progress meter carry the rest.
      open: [
        `Twelve faults are hidden in it. Some break a rule you have met; some just write a symbol badly.`,
        `A fault nobody catches gets made in metal.`,
      ],
      postBody: [
        `<b>How it is drawn:</b> the caption, the scale and the units belong to a finished sheet as much as the sizes do.`,
      ],
    },
    summary: {
      title: 'Remember',
      points: [
        'A drawing goes wrong two ways: a rule broken, or a symbol written badly. The second is commoner.',
        'State every size once. Twice is a contradiction waiting to happen.',
        'Whatever the scale, write the REAL size on the line.',
        'Millimetres need no unit. Anything else must be stated once, near the title.',
      ],
    },
  },
];

/**
 * The rules of dimensioning, as a closing checklist. Same rules the chapter gives, said the
 * way you would say them at a drawing board. Reachable from the moment Step 6 opens — a
 * checklist you cannot consult while working is not a checklist.
 * @type {string[]}
 */
export const BIS_CHECKLIST = Object.freeze([
  'Everything that measures — projection, dimension and leader lines — is drawn thin.',
  'Projection lines run 1 to 2 mm past the dimension line.',
  'Lines do not cross unless there is no way round it.',
  'Projection lines come off the feature at a right angle.',
  'Measure from edges you can see, never from dashed ones.',
  'Both ends of a dimension line are closed by an arrow head.',
  'Where two arrows meet head to head, a clear dot or slash may replace them.',
  'If a value has to sit in hatching, break the hatching around it.',
  'One system of values throughout — never a mixture.',
]);

/**
 * The practical settings this simulation ships with, and why. Shown beside the checklist.
 * @type {Array<{ title: string, detail: string }>}
 */
export const CLASSWORK_SYSTEM = Object.freeze([
  { title: 'Values', detail: 'Aligned — lying along their own line. It is compact and it is what the textbook uses.' },
  { title: 'Arrow heads', detail: 'Open, narrow, 3 to 4 mm long, drawn with a thick line. Everything else stays thin. Where there is no room, a 1.5 mm dot.' },
  { title: 'Lettering', detail: 'Even numerals 3 to 4 mm high, sitting about half a millimetre above the line.' },
  { title: 'Units', detail: 'Millimetres. A bare number IS millimetres, so no unit is written after it. Any other unit must be stated.' },
  { title: 'Scale', detail: 'Usually full size. Whatever the scale, the number on the line is the part\'s real size.' },
  { title: 'Caption', detail: 'The name of the part in capitals under the drawing, 3 to 5 mm high.' },
]);

/**
 * Step 6's sheet settings — the three things on a finished drawing that are not dimensions.
 * Changing the scale must NOT change a single value; that is the whole lesson, and the only
 * way to show it is to let the learner try.
 * @type {{ scales:Array<{id:string,label:string,zoom:number,note:string}>,
 *          units:Array<{id:string,label:string,factor:number,note:string,titleNote:string}> }}
 */
export const SHEET_SETTINGS = Object.freeze({
  scales: Object.freeze([
    { id: '1:1', label: '1:1', zoom: 1, note: 'Full size — the usual choice.' },
    { id: '1:2', label: '1:2', zoom: 0.62, note: 'Drawn at half size to fit the sheet. Look at the numbers: not one of them changed.' },
    { id: '2:1', label: '2:1', zoom: 1.6, note: 'Drawn at twice size to show small detail. Again nothing changed — a 200 long plate is 200 whether you draw it 100 or 400.' },
  ]),
  units: Object.freeze([
    { id: 'mm', label: 'Millimetres', factor: 1, note: 'The normal unit. A bare number already means millimetres, so nothing is written after it.', titleNote: '' },
    { id: 'cm', label: 'Centimetres', factor: 0.1, note: 'Any other unit has to be stated. Say it once near the title rather than after every number.', titleNote: 'ALL DIMENSIONS IN cm' },
  ]),
});
