// The rule catalogue (Module 1 Topic 1.1 — Dimensioning), Step 2.
//
// PURE DATA LEAF (ADR-007 / RULES.md §3.6) apart from the pure-data `dimensionData.js`
// import (ADR-133). Each entry pairs the CORRECT drawing of one dimension with the drawing
// that breaks exactly one rule, so the student can flip between them and watch the ambiguity
// appear. Nothing here renders — `dimensionDraw.js` does.
//
// A few entries are PERMISSIONS rather than prohibitions — the chapter allows something a
// student would not expect. Those carry `permission: true` and their own switch labels,
// because showing a permitted alternative in the wrong-colour would teach the opposite.
//
// VOICE: plain teaching language, no citations. The rules are unchanged in substance; only
// the wording is. `ref` is a two-word tag for the option row, not a reference.

import { FIGURES, lanesFor } from './dimensionData.js';

// THE FIGURE THESE RULES ARE SET ON: the plate with one hole.
//
// Every one of the ten rules is about WHERE a part of a dimension may go, and none of them is
// about the part. So the part is the simplest one that can put all ten arguments on the sheet:
// an outline to run projection lines off, a centre line to be tempted to dimension along, one
// dashed circle to be caught measuring from, and enough empty paper to crowd. On the Guide
// Plate the same ten rules were argued next to a bore, a spigot, a square hole and a spherical
// seat, none of which the learner had been taught yet.
const FIG = FIGURES.hole;
const P = FIG.plate;
const H = FIG.features.hole;
const CSK = H.countersink;
const LANE = lanesFor(FIG);
const BELOW = LANE.below1;
const LEFT = LANE.left1;

/** A point on the hole's rim at `deg`, for the leaders to land on. */
const onRim = (deg) => [
  H.at[0] + Math.cos(deg * Math.PI / 180) * (H.dia / 2),
  H.at[1] + Math.sin(deg * Math.PI / 180) * (H.dia / 2),
];

/**
 * The dimension the learner PLACES themselves, drawn alongside whichever rule is up. It states
 * the one size no rule states — the gap from the hole to the right-hand face — so the sheet
 * never shows the same measurement twice while they are dragging.
 * @returns {object}
 */
export function dragDemo() {
  return {
    id: 'drag', kind: 'linear', axis: 'x',
    from: [H.at[0], P.height], to: [P.length, P.height],
    at: LANE.above1, text: String(P.length - H.at[0]),
    draggable: true,
    title: 'Drag me, or focus me and use the arrow keys',
  };
}

/**
 * The rule demonstrations. `correct` and `wrong` are full spec lists — Step 2 shows one
 * dimension at a time so the rule under discussion is the only thing on the sheet.
 *
 * `centreLines` asks the rig to show the part's centre lines, because some rules are only
 * legible against them. `permission` swaps the switch's wording to two lawful alternatives.
 *
 * @type {Array<{
 *   id:string, ref:string, title:string, rule:string, breaks:string,
 *   correct:object[], wrong:object[],
 *   centreLines?:boolean, permission?:boolean,
 *   okLabel?:string, altLabel?:string, okNote?:string,
 * }>}
 */
export const RULES = Object.freeze([
  {
    id: 'ext-overshoot',
    ref: 'Projection lines',
    title: 'Projection lines run past the dimension line',
    rule: 'A projection line starts right on the feature — no gap — and runs 1 to 2 mm past the dimension line.',
    breaks: 'Stopped short, it no longer closes the measurement. You have to guess what the arrow is pointing at, and on a busy drawing you will guess wrong.',
    correct: [{ id: 'r-len', kind: 'linear', axis: 'x', from: [0, 0], to: [P.length, 0], at: BELOW, text: String(P.length) }],
    wrong: [{ id: 'r-len', kind: 'linear', axis: 'x', from: [0, 0], to: [P.length, 0], at: BELOW, text: String(P.length), extShort: true, tone: 'bad' }],
  },
  {
    id: 'ext-perpendicular',
    ref: 'Projection lines',
    title: 'Projection lines come off at a right angle',
    rule: 'A projection line leaves the feature square on. Slanted ones are allowed only in special cases, and then they all slant the same way.',
    breaks: 'A slanted line no longer says WHERE the measurement starts. It lands somewhere along an edge instead of at a point, so nobody can repeat it.',
    correct: [{ id: 'r-ht', kind: 'linear', axis: 'y', from: [0, 0], to: [0, P.height], at: LEFT, text: String(P.height) }],
    wrong: [{ id: 'r-ht', kind: 'linear', axis: 'y', from: [0, 0], to: [0, P.height], at: LEFT, text: String(P.height), extSkew: 22, tone: 'bad' }],
  },
  {
    id: 'projline-reuse',
    ref: 'Allowed',
    title: 'A centre line or an edge may carry the measurement out',
    rule: 'You do not always need a new projection line. A hole\'s centre line, or an edge of the part, can be extended out to the dimension line instead.',
    breaks: 'Both drawings are correct. Extending lines the part already has saves strokes and ties each size to its feature. It does NOT work the other way round: a centre line may carry a dimension, but it must never BE one.',
    permission: true,
    okLabel: 'Its own projection lines',
    altLabel: 'Centre line + edge extended',
    okNote: 'The long way: two fresh projection lines carry the hole centre and the bottom face out to the dimension line.',
    centreLines: true,
    correct: [
      { id: 'r-reuse', kind: 'linear', axis: 'y', from: [0, 0], to: [0, H.at[1]], at: LEFT, text: String(H.at[1]) },
    ],
    wrong: [
      // The hole's own centre line and the bottom edge, run out to the dimension line, ARE
      // the projection lines. Nothing new is drawn but the extensions.
      { id: 'r-reuse-c', kind: 'aid', from: [H.at[0], H.at[1]], to: [LEFT - 2, H.at[1]] },
      { id: 'r-reuse-o', kind: 'aid', from: [0, 0], to: [LEFT - 2, 0] },
      { id: 'r-reuse', kind: 'linear', axis: 'y', from: [0, 0], to: [0, H.at[1]], at: LEFT, text: String(H.at[1]), noExtension: true },
    ],
  },
  {
    id: 'no-crossing',
    ref: 'Dimension lines',
    title: 'Keep dimension lines from crossing',
    rule: 'Dimension lines and projection lines should not cross other lines unless there is no way round it.',
    breaks: 'Every crossing is a place where two lines can be read as one. Dropped inside the part, this one cuts clean across the hole and its centre line, and your eye has to pick them apart.',
    centreLines: true,
    correct: [{ id: 'r-cross', kind: 'linear', axis: 'y', from: [P.length, 0], to: [P.length, P.height], at: LANE.right1, text: String(P.height) }],
    wrong: [{ id: 'r-cross', kind: 'linear', axis: 'y', from: [P.length, 0], to: [P.length, P.height], at: H.at[0], text: String(P.height), tone: 'bad' }],
  },
  {
    id: 'not-on-centre',
    ref: 'Dimension lines',
    title: 'A centre line is never a dimension line',
    rule: 'Never put a value and arrow heads on a centre line, or on an edge of the part.',
    breaks: 'The chain line means "this is the axis of the hole". Load a measurement onto it and one line is saying two things — and it stops reading as an axis.',
    centreLines: true,
    correct: [{ id: 'r-hole-x', kind: 'linear', axis: 'x', from: [0, 0], to: H.at, at: BELOW, text: String(H.at[0]) }],
    wrong: [{ id: 'r-hole-x', kind: 'linear', axis: 'x', from: [0, 0], to: H.at, at: H.at[1], text: String(H.at[0]), noExtension: true, tone: 'bad' }],
  },
  {
    id: 'visible-outlines',
    ref: 'Dimension lines',
    title: 'Measure from edges you can see',
    rule: 'Take dimensions from visible edges, not from dashed ones.',
    breaks: 'That dashed circle is on the BACK of the plate. This view cannot show a back-face feature truly, so measuring to it measures a shadow. Locate the hole from the drilled circle you can see, and put the countersink in a note.',
    correct: [
      { id: 'r-visible', kind: 'linear', axis: 'x', from: [0, 0], to: H.at, at: BELOW, text: String(H.at[0]) },
    ],
    wrong: [
      {
        id: 'r-visible', kind: 'linear', axis: 'x', tone: 'bad',
        from: [0, 0], to: [H.at[0] + CSK.dia / 2, H.at[1]],
        at: BELOW, text: String(H.at[0] + CSK.dia / 2),
      },
    ],
  },
  {
    id: 'broken-feature',
    ref: 'Shortened parts',
    title: 'A shortened drawing keeps its full dimension line',
    rule: 'When a long part is drawn with its middle cut out, the dimension line still runs straight across the break and states the real length.',
    breaks: 'Break the dimension line too and the drawing states the length of the PICTURE. The workshop makes a plate 122 long, and the 130 you meant is nowhere on the sheet.',
    correct: [
      { id: 'r-brk-mark', kind: 'break', atMm: 100, fromMm: -1, toMm: P.height + 1 },
      { id: 'r-brk', kind: 'linear', axis: 'x', from: [0, 0], to: [P.length, 0], at: BELOW, text: String(P.length) },
    ],
    wrong: [
      { id: 'r-brk-mark', kind: 'break', atMm: 100, fromMm: -1, toMm: P.height + 1 },
      { id: 'r-brk-a', kind: 'linear', axis: 'x', from: [0, 0], to: [96, 0], at: BELOW, text: '96', tone: 'bad' },
      { id: 'r-brk-b', kind: 'linear', axis: 'x', from: [104, 0], to: [P.length, 0], at: BELOW, text: '26', tone: 'bad' },
    ],
  },
  {
    id: 'leader-angle',
    ref: 'Leader lines',
    title: 'Leaders come off at 30° or more',
    rule: 'A leader leaves its feature at 30° or steeper, and never runs parallel to a nearby dimension line. Give each note its own.',
    breaks: 'A shallow leader lying along the part reads as one more dimension line. At 8° this one is parallel to the dimension below it, so the note looks like it belongs to that measurement.',
    correct: [{ id: 'r-note', kind: 'leader', anchor: onRim(60), dirDeg: 60, lengthMm: 34, barMm: 14, head: 'arrow', text: `ø${H.dia}` }],
    wrong: [{ id: 'r-note', kind: 'leader', anchor: onRim(8), dirDeg: 8, lengthMm: 48, barMm: 14, head: 'arrow', text: `ø${H.dia}`, tone: 'bad' }],
  },
  {
    id: 'spacing',
    ref: 'Spacing',
    title: 'Leave 5–6 mm of clear space',
    rule: 'Keep every dimension line at least 5 to 6 mm away from the part, and from the next dimension line.',
    breaks: 'Crowded against the edge, the dimension line merges with the part. The arrow heads touch the outline and the value has nowhere to sit.',
    correct: [
      { id: 'r-a', kind: 'linear', axis: 'x', from: [0, 0], to: H.at, at: BELOW, text: String(H.at[0]) },
      { id: 'r-b', kind: 'linear', axis: 'x', from: [0, 0], to: [P.length, 0], at: LANE.below2, text: String(P.length) },
    ],
    wrong: [
      { id: 'r-a', kind: 'linear', axis: 'x', from: [0, 0], to: H.at, at: -2.5, text: String(H.at[0]), tone: 'bad' },
      { id: 'r-b', kind: 'linear', axis: 'x', from: [0, 0], to: [P.length, 0], at: -5.5, text: String(P.length), tone: 'bad' },
    ],
  },
  {
    id: 'hatch-text',
    ref: 'Sections',
    title: 'Hatching stops short of the value',
    rule: 'If a value has to sit inside hatching, break the hatching around it and pick it up on the far side.',
    breaks: 'Hatching is thin evenly spaced lines — exactly the weight of the strokes in a numeral. Run it through a value and a 6 reads as an 8. This rule is purely about being able to read the number.',
    // A cut face, drawn in the empty paper right of the hole and clear of its countersink.
    correct: [
      { id: 'r-hatch', kind: 'hatch', rect: [84, 12, 120, 26], pitchMm: 3.4, angleDeg: 45, clear: [102, 21.6, 16, 9] },
      { id: 'r-hatch-d', kind: 'linear', axis: 'x', from: [84, 19], to: [120, 19], at: 19, noExtension: true, text: '36' },
    ],
    wrong: [
      { id: 'r-hatch', kind: 'hatch', rect: [84, 12, 120, 26], pitchMm: 3.4, angleDeg: 45, tone: 'bad' },
      { id: 'r-hatch-d', kind: 'linear', axis: 'x', from: [84, 19], to: [120, 19], at: 19, noExtension: true, text: '36', tone: 'bad' },
    ],
  },
]);

/**
 * The ways a dimension line may end. Changing one changes the whole sheet, which IS the
 * lesson: only one style per drawing.
 * @type {Array<{ id:string, name:string, glyph:string, detail:string, angled?:boolean }>}
 */
export const TERMINATIONS = Object.freeze([
  { id: 'open', name: 'Open', glyph: '&gt;', angled: true, detail: 'Two short lines meeting at a point, drawn thick. Narrow — about 15° — and 3 to 4 mm long. This is the everyday choice.' },
  { id: 'closed', name: 'Closed', glyph: '▷', angled: true, detail: 'The same head with its back closed, outlined but left open inside.' },
  { id: 'filled', name: 'Filled', glyph: '▶', angled: true, detail: 'The closed head blacked in. The boldest of them, and what most printed drawings use.' },
  { id: 'oblique', name: 'Slash', glyph: '/', detail: 'A short stroke at 45° across the line, instead of a head.' },
  { id: 'dot', name: 'Dot', glyph: '●', detail: 'A filled dot about 1.5 mm across, for when there is no room for a head at all.' },
]);

/**
 * The three ways a leader may end. All three are right; which one depends on what it points
 * AT — and that is the whole lesson, so the copy stays short.
 * @type {Array<{ id:string, head:'dot'|'arrow'|'none', name:string,
 *                points:string, detail:string, anchor:'surface'|'edge'|'dimline' }>}
 */
export const LEADER_HEADS = Object.freeze([
  {
    id: 'dot', head: 'dot', name: 'Dot on a face',
    anchor: 'surface', points: 'at a SURFACE',
    detail: 'Use a dot when the note is about the face itself — a finish, a treatment. It must sit clearly inside the outline, or nobody can tell which face you mean.',
  },
  {
    id: 'arrow', head: 'arrow', name: 'Arrow on an edge',
    anchor: 'edge', points: 'at an EDGE',
    detail: 'The everyday case. The arrow lands on the outline, because the note is about that edge — a hole, a chamfer, a radius.',
  },
  {
    id: 'none', head: 'none', name: 'No head on a dimension line',
    anchor: 'dimline', points: 'at a DIMENSION LINE',
    detail: 'Neither dot nor arrow. The dimension line already has its own ends; a third head there would mark a limit that does not exist.',
  },
]);

/**
 * Check where the learner dropped the draggable value. Distances are in mm at drawing scale.
 * `rule` is the short label shown beside the verdict — a name, not a citation.
 *
 * @param {number} alongMm  Offset ALONG the dimension line from its middle.
 * @param {number} outMm    Offset PERPENDICULAR to it; positive is the legal "above" side.
 * @param {number} spanMm   Length of the dimension line.
 * @returns {{ ok: boolean, rule?: string, message: string }}
 */
export function validatePlacement(alongMm, outMm, spanMm) {
  if (outMm < 0.4) {
    return {
      ok: false,
      rule: 'Below the line',
      message: 'The value goes ABOVE its dimension line, not on it and not under it. Down here it fights the line itself.',
    };
  }
  if (outMm > 4) {
    return {
      ok: false,
      rule: 'Floated off',
      message: 'Too far away. It should sit about half a millimetre above the line — out here it stops belonging to any measurement.',
    };
  }
  if (Math.abs(alongMm) > Math.max(8, spanMm * 0.22)) {
    return {
      ok: false,
      rule: 'Off to one end',
      message: 'Put it in the MIDDLE of its line. Slid to one end it looks like it belongs to whatever is next to it.',
    };
  }
  return { ok: true, message: 'Good — above the line, clear of it, and in the middle.' };
}
