// Foundations content model (Module 1 Topic 1) — the single source of truth for the
// four-step BIS line-type lesson copy and its glossary.
//
// This is a PURE DATA leaf module (ADR-007 / RULES.md §3.6): it imports nothing and owns
// no DOM. `stepper.js` consumes it to paint the step card, and the card's inline
// <button class="term" data-t="…"> glossary triggers look their definitions up in TERMS.
//
//   STEPS  — per-step tutor copy: title, one-line lead, and a `body` split into `open`
//            (the "What it is" AND "Why we use it" paragraphs) and `postBody` (the "How it is
//            drawn" paragraph). `open` paints in #step-body ABOVE the reveal controls; `postBody`
//            paints in #step-post-body BELOW them, so the interactive buttons are never buried
//            below the fold. Both render inline and fully visible — no collapsed disclosure.
//            Authored as HTML so the inline glossary term-buttons can ride along inside the prose.
//   TERMS  — the glossary: keyed by the `data-t` id on each in-prose term button; each
//            entry carries a short `label` (for the trigger's accessible name / popover
//            heading) and a full `def` (the pop-over definition text).

/**
 * Glossary of the terms surfaced as inline <button class="term" data-t="…"> triggers
 * inside the step bodies. Key = the `data-t` id; `label` = the term's display name;
 * `def` = the definition shown when the learner opens the term.
 * @type {Record<string, { label: string, def: string }>}
 */
export const TERMS = {
  visible: {
    label: 'visible edge',
    def: `Visible edge: An outline or corner of the object you can actually see from your current direction. Drawn as a continuous thick line (Type A).`,
  },
  through: {
    label: 'through-hole',
    def: `Through-hole: A hole drilled completely through the material. Its near rim is a visible circle (Type A); its far rim is hidden.`,
  },
  hidden: {
    label: 'hidden edge',
    def: `Hidden edge: A physical edge or boundary that genuinely exists but is concealed by solid material from the observer's current point of view. Drawn as a dashed line.`,
  },
  blind: {
    label: 'blind hole',
    def: `Blind hole: A hole drilled only partially into the material, without breaking through to the other side. Because you cannot see through it, its internal depth is communicated using hidden dashed lines.`,
  },
  centre: {
    label: 'centre line',
    def: `Centre line: A thin long-dash-dot chain line marking an axis of symmetry or the exact centre of a circular feature, such as the axis of a hole (Type G).`,
  },
  symmetry: {
    label: 'axis of symmetry',
    def: `Axis of symmetry: An imaginary line dividing a geometrical feature or machine part into two perfectly identical, mirrored halves.`,
  },
  dimline: {
    label: 'dimension line',
    def: `Dimension line: A continuous thin line (Type B) terminated by arrowheads, used to indicate the exact span of a measurement.`,
  },
  extline: {
    label: 'extension line',
    def: `Extension line: A continuous thin line (Type B) that projects out from the object's edges, giving the dimension line a place to sit without crowding the part.`,
  },
  aligned: {
    label: 'aligned system',
    def: `Aligned system: A dimensioning rule where the text is placed parallel to the dimension line, designed to be read from the bottom or the right-hand edge of the paper.`,
  },
  uni: {
    label: 'unidirectional system',
    def: `Unidirectional system: A dimensioning rule where all text is kept strictly horizontal to be read from the bottom edge of the sheet.`,
  },
  arrowhead: {
    label: 'arrowhead',
    def: `Arrowhead: The filled, 3:1 ratio triangular termination at the end of a dimension line that points exactly to the boundary.`,
  },
  ratio: {
    label: '3:1 ratio',
    def: `3:1 Ratio: The strict geometrical rule for drawing arrowheads, meaning the length of the arrow must be three times its widest back end.`,
  },
};

/**
 * Per-step lesson copy. `body.open` and `body.postBody` entries are HTML strings (they carry
 * <b> subheadings and inline <button class="term" data-t="…"> glossary triggers), so the
 * renderer must inject them as innerHTML, not textContent. `open` (What it is + Why we use it)
 * paints ABOVE the reveal controls; `postBody` (How it is drawn) paints BELOW them. A step may
 * omit `postBody` (Step 1 keeps its prose contiguous), leaving #step-post-body empty.
 * @type {Array<{ n: number, title: string, lead: string, body: { open: string[], postBody: string[] } }>}
 */
export const STEPS = [
  {
    n: 1,
    title: 'Continuous thick: visible edges',
    lead: 'The visual hierarchy of the BIS SP 46:2003 line alphabet.',
    body: {
      open: [
        `<b>What it is:</b> Type A lines are continuous thick lines (often called "wide" lines). In the BIS SP 46:2003 line alphabet, they are used exclusively to represent the visible outlines and <button type="button" class="term" data-t="visible">visible edges</button> of an object.`,
        `<b>Why we use it:</b> Every engineering drawing relies on visual hierarchy. Type A lines are the boldest and heaviest lines on the sheet. We use them so that the primary physical shape of the machine part reads instantly at a glance. By making the visible boundaries thick, the core solid stands out clearly and never gets confused with the lighter lines used for dimensions or hidden details inside the part.`,
        // Step 1's panel is a passive orbit hint (no reveal button), so its "How it is drawn"
        // stays contiguous in the body rather than dropping below the controls — postBody empty.
        `<b>How it is drawn:</b> It is drawn as a single, unbroken, dark stroke. In manual drafting, this is achieved using a softer lead pencil (like H or HB) applying firm pressure to create a dense, wide line (often 0.5 mm or thicker depending on the drawing scale). On our 3D Bearing Block, the outer silhouette of the casting, the near rim of the <button type="button" class="term" data-t="through">through-hole</button>, and the sharp 90-degree corners of the mounting feet are all drawn as Type A visible lines.`,
      ],
      postBody: [],
    },
  },
  {
    n: 2,
    title: 'Dashed: hidden edges',
    lead: 'Communicating internal geometry that is blocked from view.',
    body: {
      open: [
        `<b>What it is:</b> Type E (thick) and Type F (thin) lines are dashed lines consisting of short, evenly spaced strokes. In the BIS SP 46:2003 line alphabet, these lines are used exclusively to represent the hidden outlines and <button type="button" class="term" data-t="hidden">hidden edges</button> of an object.`,
        `<b>Why we use it:</b> When viewing a solid machine part, many internal or rear features (like through-bores, <button type="button" class="term" data-t="blind">blind holes</button>, or back corners) are blocked from view by the solid material in front of them. If we omitted them from the 2D drawing, the machinist would not know they exist. We use dashed lines to communicate a very specific message: "This geometric feature physically exists, but it is concealed behind material from your current viewing angle".`,
      ],
      postBody: [
        `<b>How it is drawn:</b> A hidden line is drawn as a series of short, uniform dashes (typically 2 to 3 mm long) separated by small, equal gaps (about 1 to 2 mm). Good drafting practice dictates that the dashes should physically touch the visible outlines they intersect at both their starting and ending points. On our 3D Bearing Block, the vertical mounting holes drilled through the feet and the far rim of the central bore are drawn as dashed lines because the front of the block hides them from the camera.`,
      ],
    },
  },
  {
    n: 3,
    title: 'Chain thin: centre lines',
    lead: 'Locating axes of symmetry and mathematical centres.',
    body: {
      open: [
        `<b>What it is:</b> Type G lines are chain thin lines. Rather than a continuous stroke, they are drawn as an alternating pattern of long dashes and short dashes (or dots) separated by small gaps. In the BIS SP 46:2003 line alphabet, they are used primarily to represent <button type="button" class="term" data-t="centre">centre lines</button>, <button type="button" class="term" data-t="symmetry">lines of symmetry</button>, and trajectories.`,
        `<b>Why we use it:</b> Not every line on a drawing represents a physical edge you can touch. We need a way to mathematically locate features like the exact centre of a pitch circle or the central axis of a rotating shaft. We use the chain pattern specifically so that these imaginary geometric guides never get mistaken for actual visible or hidden physical edges. By keeping them thin, they sit quietly in the background without fighting the heavy Type A outlines for the reader's attention.`,
      ],
      postBody: [
        `<b>How it is drawn:</b> A centre line is drawn as a thin line (for example, 0.1 mm or 0.2 mm thick depending on the chosen line group). The pattern typically starts and ends on a long dash. On our 3D Bearing Block, the horizontal axis running straight through the main bore, the vertical line of symmetry slicing the block in half, and the small centre crosses marking the exact drilling locations for the mounting holes are all drawn as Type G chain lines.`,
      ],
    },
  },
  {
    n: 4,
    title: 'Continuous thin: dimension lines',
    lead: 'Communicating the exact manufacturing measurements.',
    body: {
      open: [
        `<b>What it is:</b> Type B lines are continuous thin lines. In the BIS SP 46:2003 line alphabet, they are used for <button type="button" class="term" data-t="dimline">dimension lines</button>, <button type="button" class="term" data-t="extline">extension lines</button>, and leader lines. A complete dimension actually consists of three parts: the dimension line ending in <button type="button" class="term" data-t="arrowhead">arrowheads</button>, the extension lines bringing the measurement clear of the object, and the dimension figure itself.`,
        `<b>Why we use it:</b> An engineering drawing without dimensions is just a picture. Dimensions must be provided so completely that a machinist never has to guess, calculate, or physically measure the drawing with a ruler to manufacture the part. We use the thinnest continuous line possible (Type B) for this job so that the annotations sit quietly in the background and never overpower the bold, thick Type A outlines of the physical part.`,
      ],
      postBody: [
        `<b>How it is drawn:</b> Dimension lines are drawn as unbroken, faint strokes (typically 0.1 mm to 0.2 mm thick) sitting at least 8 mm outside the object's boundary. They are capped with perfectly proportioned arrowheads of a strict <button type="button" class="term" data-t="ratio">3:1 ratio</button> whose tips touch the extension lines. When adding the numeric figures, there are two standard systems: The <button type="button" class="term" data-t="aligned">Aligned System</button> and The <button type="button" class="term" data-t="uni">Unidirectional System</button>.`,
      ],
    },
  },
];
