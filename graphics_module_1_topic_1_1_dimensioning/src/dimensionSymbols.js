// The shape symbols (Module 1 Topic 1.1 — Dimensioning), Step 5.
//
// PURE DATA LEAF (ADR-007 / RULES.md §3.6) apart from the pure-data `dimensionData.js`
// import (ADR-133).
//
// While dimensioning, you say what SHAPE the feature is as well as how big it is, because it
// improves how the drawing reads. There are five recommended symbols, and they go in FRONT of
// the value:
//
//     ø  diameter        Sø  ball diameter
//     R  radius          SR  ball radius
//     □  square
//
// THOSE FIVE — and only those five — are the symbol set (`bis: true`). The chapter also
// dimensions a slot, a chamfer, a countersink and a chord, but with values, notes and
// conventions rather than a symbol. They are carried here too, flagged `bis: false` and shown
// in a separate group, because a student who cannot say which five are the real ones has not
// learned this.
//
// Each symbol carries VARIANTS — the several correct ways to draw it. A symbol is not one
// picture: a circle can be measured four ways, a radius three, a chamfer three, a countersink
// two. The variant chips are how a learner reaches all of them.
//
// SCOPE — this is the prescribed chapter's set, not ISO's complete one. It defines no depth,
// counterbore or thread symbol, so none is invented; the countersink is here because the
// chapter dimensions it explicitly.
//
// VOICE: plain teaching language, no citations.

import {
  PLATE, FEATURES, SLOT_LENGTH, BORE_MOUTH_DIA, SPIGOT_RECT, CROWN_CENTRE,
} from './dimensionData.js';

const F = FEATURES;
const CSK = F.cskHole.countersink;

/** A point on a circle of radius r about `c`, at `deg` (mm). */
const onCircle = (c, r, deg) => [
  c[0] + Math.cos(deg * Math.PI / 180) * r,
  c[1] + Math.sin(deg * Math.PI / 180) * r,
];

/** The spigot's axis station (mm) — the middle of its front-view rectangle. */
const SPIGOT_MID_X = (SPIGOT_RECT.x0 + SPIGOT_RECT.x1) / 2;

/**
 * @type {Array<{
 *   id:string, glyph:string, name:string, bis:boolean,
 *   meaning:string, usage:string, placement:string, mistake:string,
 *   feature:string, rear?:boolean,
 *   variants:Array<{ id:string, label:string, note:string, specs:object[] }>,
 * }>}
 */
export const SYMBOLS = Object.freeze([
  // ==========================================================================
  // The five shape symbols
  // ==========================================================================
  {
    id: 'diameter', glyph: 'ø', name: 'Diameter', bis: true,
    feature: 'bore',
    meaning: 'The number is the width of a circle, right across its middle.',
    usage: 'Measure straight across the circle, across it with the arrows outside, or on a leader off its edge. A cylinder drawn as a rectangle takes ø too.',
    placement: 'Tight in front of the number: ø40, never 40ø and never "40 Dia".',
    mistake: 'Dropping ø on a leader. The reader cannot see what the number spans, so it could be anything.',
    variants: [
      {
        id: 'across', label: 'Across the circle',
        note: 'The line runs right across through the middle, with an arrow each side. Because you can see it spanning the full width, it can only be a diameter.',
        specs: [{ id: 's-dia-inside', kind: 'diameter', mode: 'inside', centre: F.bore.at, diaMm: F.bore.dia, dirDeg: 200, text: `ø${F.bore.dia}` }],
      },
      {
        id: 'outside', label: 'Arrows outside',
        note: 'A small circle has no room for two arrows inside it. Run the line out past the circle and point the arrows back in.',
        specs: [{ id: 's-dia-small', kind: 'diameter', mode: 'outside', centre: F.cskHole.at, diaMm: F.cskHole.dia, dirDeg: 20, text: `ø${F.cskHole.dia}` }],
      },
      {
        id: 'leader', label: 'On a leader',
        note: 'A leader takes the number clear of a crowded view. Here ø is doing all the work — nothing in the picture shows what the number spans.',
        specs: [{ id: 's-dia-leader', kind: 'diameter', mode: 'leader', centre: F.bore.at, diaMm: F.bore.dia, dirDeg: 55, lengthMm: 26, barMm: 14, text: `ø${F.bore.dia}` }],
      },
      {
        id: 'cylindrical', label: 'On a cylinder',
        note: 'The stub on the right end is round, but lying sideways it draws as a rectangle. Only the ø and the centre line running along it say it is a cylinder and not a flat tongue.',
        specs: [
          {
            id: 's-cyl', kind: 'linear', axis: 'y', noExtension: true,
            from: [SPIGOT_MID_X, SPIGOT_RECT.y0], to: [SPIGOT_MID_X, SPIGOT_RECT.y1],
            at: SPIGOT_MID_X, text: `ø${F.spigot.dia}`,
          },
          {
            id: 's-cyl-len', kind: 'linear', axis: 'x',
            from: [SPIGOT_RECT.x0, 0], to: [SPIGOT_RECT.x1, SPIGOT_RECT.y0],
            at: -14, text: String(F.spigot.length),
          },
        ],
      },
      {
        id: 'omitted', label: 'ø left off',
        note: 'You may drop the symbol where nothing else it could mean. Across the circle, fine — the line shows what it spans. On a leader, never.',
        specs: [{ id: 's-dia-bare', kind: 'diameter', mode: 'inside', centre: F.bore.at, diaMm: F.bore.dia, dirDeg: 200, text: String(F.bore.dia) }],
      },
    ],
  },
  {
    id: 'radius', glyph: 'R', name: 'Radius', bis: true,
    feature: 'fillet',
    meaning: 'The number is the radius of a curve — a rounded corner, an inside fillet, a curved face.',
    usage: 'ONE arrow only, and it lands on the curve itself. Take the line from the centre for a small curve, from outside for a tight one.',
    placement: 'R in front of the number. The line must run along a true radius, so it has to point at the curve\'s own centre.',
    mistake: 'Writing 8R instead of R8, or putting two arrows on it.',
    variants: [
      {
        id: 'small', label: 'From the centre',
        note: 'Mark the centre with a small cross and run the line out to the curve. One arrow, landing on the curve.',
        specs: [
          { id: 's-fillet', kind: 'radius', centre: [110, 65], radiusMm: PLATE.filletR, dirDeg: 225, text: `R${PLATE.filletR}` },
          { id: 's-corner', kind: 'radius', centre: [12, 88], radiusMm: PLATE.cornerR, dirDeg: 135, text: `R${PLATE.cornerR}` },
        ],
      },
      {
        id: 'outside', label: 'From outside',
        note: 'Too small to write inside? Come in along the radius from outside and point the arrow at the curve. Still one arrow.',
        specs: [
          { id: 's-slot-end', kind: 'radius', centre: F.slot.centres[1], radiusMm: F.slot.width / 2, dirDeg: 300, fromCentre: false, leadMm: 20, text: `R${F.slot.width / 2}` },
        ],
      },
      {
        id: 'large', label: 'Big curve',
        note: 'The top of the step is a very shallow curve, so its centre is far below the plate and off the paper altogether. Keep a short piece of the true radius where it meets the curve, then break the line and jog it in so the number fits.',
        specs: [
          {
            id: 's-crown', kind: 'radiusLarge', centre: CROWN_CENTRE, radiusMm: PLATE.crownR,
            onArcDeg: 90, jogMm: 12, falseCentre: [116, 41.7], text: `R${PLATE.crownR}`,
          },
        ],
      },
    ],
  },
  {
    id: 'sphereDia', glyph: 'Sø', name: 'Ball diameter', bis: true,
    feature: 'sphere',
    meaning: 'S for spherical, ø for diameter — so Sø is the width of a ball shape. Here, the round seat sunk into the face.',
    usage: 'Use it wherever a plain ø would be read as a flat circle instead of a ball.',
    placement: 'Sø in front of the number, on a leader off the edge of the seat.',
    mistake: 'Writing ø24 on a ball. The workshop drills a plain hole instead of scooping a round seat.',
    variants: [
      {
        id: 'leader', label: 'On a leader',
        note: 'A leader off the edge of the seat. In the flat view it is a circle; in the metal it is a scoop.',
        specs: [
          { id: 's-sdia', kind: 'leader', anchor: onCircle(F.sphere.at, F.sphere.dia / 2, 115), dirDeg: 75, lengthMm: 36, barMm: 14, head: 'arrow', text: `Sø${F.sphere.dia}` },
        ],
      },
      {
        id: 'across', label: 'Across the seat',
        note: 'Taken straight across, exactly like a plain diameter — so the S is the only thing separating a round seat from a drilled hole the same size. Turn the plate and the difference is obvious. On the flat sheet it is one letter.',
        specs: [
          { id: 's-sdia-across', kind: 'diameter', mode: 'inside', centre: F.sphere.at, diaMm: F.sphere.dia, dirDeg: 20, text: `Sø${F.sphere.dia}` },
        ],
      },
    ],
  },
  {
    id: 'sphereRad', glyph: 'SR', name: 'Ball radius', bis: true,
    feature: 'sphere',
    meaning: 'The radius of that same ball shape.',
    usage: 'Sø and SR describe the same seat. Give whichever the workshop needs — the width to gauge it, the radius to form it.',
    placement: 'SR in front of the number, on a line running along a true radius.',
    mistake: 'Giving both Sø and SR on one feature. That is the same size stated twice, and a later change can leave them disagreeing.',
    variants: [
      {
        id: 'radial', label: 'Along a radius',
        note: 'One arrow, landing on the curve. A ball radius obeys the radius rules exactly.',
        specs: [
          { id: 's-srad', kind: 'radius', centre: F.sphere.at, radiusMm: F.sphere.radius, dirDeg: 250, fromCentre: false, leadMm: 22, text: `SR${F.sphere.radius}` },
        ],
      },
    ],
  },
  {
    id: 'square', glyph: '□', name: 'Square', bis: true,
    feature: 'square',
    meaning: 'The feature is square, and the one number is the length of a side.',
    usage: 'One number with □ replaces two equal side measurements. You can also draw thin diagonals across the face to say "this is square".',
    placement: '□ in front of the number, on a leader or straight across the feature.',
    mistake: 'Measuring both sides separately. It doubles the numbers, and one later change can make your "square" a rectangle.',
    variants: [
      {
        id: 'leader', label: 'On a leader',
        note: 'One number off one side. The □ supplies the other side.',
        specs: [
          { id: 's-sq', kind: 'leader', anchor: [F.square.at[0] + F.square.side / 2, F.square.at[1]], dirDeg: 55, lengthMm: 42, barMm: 14, head: 'arrow', text: `□${F.square.side}` },
        ],
      },
      {
        id: 'across', label: 'Across the feature',
        note: 'Where the view has room, put the number straight across. The line spans one side; the symbol says the other matches.',
        specs: [
          {
            id: 's-sq-across', kind: 'linear', axis: 'y', noExtension: true,
            from: [F.square.at[0], F.square.at[1] - F.square.side / 2],
            to: [F.square.at[0], F.square.at[1] + F.square.side / 2],
            at: F.square.at[0], text: `□${F.square.side}`,
          },
        ],
      },
      {
        id: 'diagonals', label: 'With diagonals',
        note: 'Two thin crossing strokes say "this face is flat and square" at a glance. They are a convention, not edges — which is why they are drawn thin.',
        specs: [
          { id: 's-sq', kind: 'leader', anchor: [F.square.at[0] + F.square.side / 2, F.square.at[1]], dirDeg: 55, lengthMm: 42, barMm: 14, head: 'arrow', text: `□${F.square.side}` },
          { id: 's-sq-d1', kind: 'aid', from: [F.square.at[0] - F.square.side / 2, F.square.at[1] - F.square.side / 2], to: [F.square.at[0] + F.square.side / 2, F.square.at[1] + F.square.side / 2] },
          { id: 's-sq-d2', kind: 'aid', from: [F.square.at[0] - F.square.side / 2, F.square.at[1] + F.square.side / 2], to: [F.square.at[0] + F.square.side / 2, F.square.at[1] - F.square.side / 2] },
        ],
      },
    ],
  },

  // ==========================================================================
  // Conventions — dimensioned, but not symbols
  // ==========================================================================
  {
    id: 'chamfer', glyph: '45°', name: 'Chamfer', bis: false,
    feature: 'chamfer',
    meaning: 'A corner cut off flat. Give how far it cuts, and at what angle.',
    usage: 'Length and angle, separately or in one note. At 45° one note does both: 10 × 45°.',
    placement: 'On a leader off the cut face, or as a length and an angle measured separately.',
    mistake: 'Giving only the length. Without the angle the cut is undefined — and the short form is only allowed BECAUSE the 45° is in it.',
    variants: [
      {
        id: 'simplified', label: 'One note',
        note: 'Both numbers in one note. Allowed only at 45°; at any other angle you must give them separately.',
        specs: [
          { id: 's-chamfer', kind: 'leader', anchor: [195, 45], dirDeg: 40, lengthMm: 28, barMm: 14, head: 'arrow', text: `${PLATE.chamfer} × 45°` },
        ],
      },
      {
        id: 'separate', label: 'Length and angle',
        note: 'The long way, and the only correct way at any angle but 45°: the cut\'s length on a dimension line, the angle on an angle dimension about the corner it replaced.',
        specs: [
          { id: 's-ch-len', kind: 'linear', axis: 'x', from: [PLATE.length - PLATE.chamfer, PLATE.stepHeight], to: [PLATE.length, PLATE.stepHeight], at: 68, text: String(PLATE.chamfer) },
          { id: 's-ch-ang', kind: 'angular', vertex: [PLATE.length, 40], radiusMm: 24, fromDeg: 90, toDeg: 135, text: '45°' },
        ],
      },
      {
        id: 'internal', label: 'Inside a hole',
        note: 'The big bore has its mouth cut back too — which is why it shows as two circles, one inside the other. An inside chamfer is noted just like an outside one; the leader simply points into the hole.',
        specs: [
          {
            id: 's-ch-int', kind: 'leader',
            anchor: onCircle(F.bore.at, BORE_MOUTH_DIA / 2, 200),
            dirDeg: 200, lengthMm: 30, barMm: -14, head: 'arrow',
            text: `${F.bore.chamfer.width} × ${F.bore.chamfer.angle}°`,
          },
        ],
      },
    ],
  },
  {
    id: 'countersink', glyph: '⌵', name: 'Countersink', bis: false,
    feature: 'cskHole', rear: true,
    meaning: 'A cone widening the mouth of a hole, so a screw head sits flush.',
    usage: 'Give the angle of the cone with either its width or its depth. Either pair fixes the cone; the angle on its own does not.',
    placement: 'On the same leader as the hole, under the drill size.',
    mistake: 'Giving the width alone. Without the angle the cone could be any depth. And this one is on the BACK, so it draws dashed here — turn the plate to read it from the side it is cut on.',
    variants: [
      {
        id: 'by-dia', label: 'Angle and width',
        note: 'The width across the cone mouth, with its angle. This is the form a workshop can check with a caliper.',
        specs: [
          {
            id: 's-csk', kind: 'leader', anchor: onCircle(F.cskHole.at, F.cskHole.dia / 2, 225),
            dirDeg: 225, lengthMm: 52, barMm: -14, head: 'arrow',
            text: `ø${F.cskHole.dia}\nø${CSK.dia} × ${CSK.angle}° CSK`,
          },
        ],
      },
      {
        id: 'by-depth', label: 'Angle and depth',
        note: 'The same cone, said the other way: the angle with how deep it goes. Give one pair or the other — never both, or a later change leaves them describing two different cones.',
        specs: [
          {
            id: 's-csk-d', kind: 'leader', anchor: onCircle(F.cskHole.at, F.cskHole.dia / 2, 225),
            dirDeg: 225, lengthMm: 52, barMm: -14, head: 'arrow',
            text: `ø${F.cskHole.dia}\n${CSK.angle}° CSK, ${CSK.depth} deep`,
          },
        ],
      },
    ],
  },
  {
    id: 'slot', glyph: '⌷', name: 'Slot', bis: false,
    feature: 'slot',
    meaning: 'No symbol of its own. Give a slot its overall length and its width; the rounded ends follow from the width.',
    usage: 'Where the gap is too small for arrows, put them outside and point back in — or use dots.',
    placement: 'Length along the slot, width across it.',
    mistake: 'Measuring it by its two end centres and a radius. The workshop wants the size it can actually put a gauge across.',
    variants: [
      {
        id: 'overall', label: 'Length and width',
        note: 'Overall length across the round ends, and the width across the flats. The 16 wide gap has no room for two arrows, so they go outside — the same decision the space slider in Step 1 was about.',
        specs: [
          { id: 's-slot-len', kind: 'linear', axis: 'x', from: [F.slot.centres[0][0] - F.slot.width / 2, F.slot.at[1]], to: [F.slot.centres[1][0] + F.slot.width / 2, F.slot.at[1]], at: PLATE.stepHeight + 14, text: String(SLOT_LENGTH) },
          { id: 's-slot-wid', kind: 'linear', axis: 'y', noExtension: true, arrowsOutside: true, from: [F.slot.at[0], F.slot.at[1] - F.slot.width / 2], to: [F.slot.at[0], F.slot.at[1] + F.slot.width / 2], at: F.slot.at[0], text: String(F.slot.width) },
        ],
      },
    ],
  },
  {
    id: 'chordArc', glyph: '⌒', name: 'Chord and arc', bis: false,
    feature: 'cornerR',
    meaning: 'Two different lengths across the same curve: straight across it, or round along it.',
    usage: 'A straight-across measurement is an ordinary one. A round-the-curve measurement uses a curved line and carries the ⌒ mark.',
    placement: 'Straight: a normal dimension line. Curved: a line following the curve, just outside it.',
    mistake: 'Using the same number for both. On this corner one is 17 and the other is 19 — bend the metal and that difference shows.',
    variants: [
      {
        id: 'chord', label: 'Straight across',
        note: 'The direct distance between the two ends of the curve. An ordinary measurement — nothing about it says "curve".',
        specs: [
          { id: 's-chord', kind: 'linear', axis: 'aligned', from: [12, PLATE.height], to: [0, 88], at: -10, text: '17' },
        ],
      },
      {
        id: 'arc', label: 'Round the curve',
        note: 'The distance measured along the curve itself. The line follows the curve, and the ⌒ mark is what separates 19 of curve from 19 of straight line.',
        specs: [
          { id: 's-arc', kind: 'arcLength', centre: [12, 88], radiusMm: PLATE.cornerR, fromDeg: 90, toDeg: 180, offsetMm: 12, text: '⌒19' },
        ],
      },
      {
        id: 'both', label: 'Both together',
        note: 'Side by side the point is unmissable: same two ends, same curve, two different numbers. 17 straight, 19 round.',
        specs: [
          { id: 's-chord', kind: 'linear', axis: 'aligned', from: [12, PLATE.height], to: [0, 88], at: -10, text: '17' },
          { id: 's-arc', kind: 'arcLength', centre: [12, 88], radiusMm: PLATE.cornerR, fromDeg: 90, toDeg: 180, offsetMm: 12, text: '⌒19' },
        ],
      },
    ],
  },
]);

/** The five that are actually symbols — the set a student must be able to recite. */
export const BIS_SYMBOL_IDS = Object.freeze(SYMBOLS.filter((s) => s.bis).map((s) => s.id));
