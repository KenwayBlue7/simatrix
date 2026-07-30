// The BIS dimension renderer (Module 1 Topic 1.1 — Dimensioning).
//
// Takes a list of declarative dimension SPECS and emits the drawing apparatus: projection
// (extension) lines, dimension lines, leader lines, terminations, and the world anchors the
// CSS2D layer needs for the dimensional text. Nothing about WHAT to dimension lives here —
// the specs come from the step catalogues, so a rule demo, an arrangement and the review
// drawing all render through this one renderer and can never disagree about how a
// dimension is drawn.
//
// EVERY PROPORTION BELOW IS FROM THE TEXTBOOK (Chapter 4 "Dimensioning"), not invented:
//   • Projection lines extend 1–2 mm beyond the dimension line            (§4.6 rule 2)
//   • Dimension line stands 5–6 mm off the outline / the next dimension   (§4.3, Fig. 4.16)
//   • Terminations: open / closed / filled arrowheads, oblique stroke, dot (Fig. 4.5)
//   • Open arrowhead, included angle ≈15°, length 3–4 mm, drawn thick     (§4.5 item 2)
//   • Suggested closed head: length 3–4, width 1.5–2                      (Fig. 4.6)
//   • Filled dots ≈1.5 mm where there is no room for a head               (§4.5 item 2)
//   • Oblique strokes at 45° to the dimension line                        (Fig. 4.5b)
//   • Text 3–4 mm high, 0.5–1 mm clear above the dimension line           (§4.5 item 3)
//   • Method-1 text: parallel to, above, not touching, mid-length, and readable from the
//     bottom or the right-hand side                                       (§4.2 Method-1)
//   • Method-2 text: horizontal, above horizontal dimension lines and INTERRUPTING
//     non-horizontal ones at the middle, readable from the bottom         (§4.2 Method-2)
//   • Only one arrowhead is needed for a radius                           (§4.1, rule 6)
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. Imports THREE, the fat-line addons, and
// the pure-data `dimensionData.js` (ADR-078). It owns no DOM: the numeric text is handed
// back as anchors for `dimensionLabels.js` to render as CSS2D nodes (RULES.md §3.27).

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { toWorld, toUnits, HALF_DEPTH } from './dimensionData.js';

const DEG = Math.PI / 180;

const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

/** The drawing apparatus rides a hair proud of the front face so fat lines never z-fight it. */
const PROUD = 0.05;

/**
 * Line widths in CSS px. Type B — dimension, projection and leader lines — is the thinnest
 * line on the sheet; the arrow head is drawn thick, the same weight as the part's own
 * outlines. Both numbers match the sibling Foundations topic's, so a stroke of a given
 * meaning is the same weight in either lesson.
 */
const WIDTH_PX = Object.freeze({ thin: 1.0, thick: 2.5 });

/** Dash pattern for the dashed AID strokes — identical to the rig's and to Foundations'. */
const AID_DASH = Object.freeze({ size: 0.12, gap: 0.08 });

/** Termination geometry, in MILLIMETRES, straight out of Figs. 4.5/4.6 and §4.5. */
export const TERMINATION = Object.freeze({
  open:    { length: 4,   includedDeg: 15,  fill: false, stroke: 'thick' },
  closed:  { length: 3.5, width: 1.75,      fill: false, stroke: 'thin'  },
  filled:  { length: 3.5, width: 1.75,      fill: true,  stroke: 'thin'  },
  oblique: { length: 3.5, angleDeg: 45,     fill: false, stroke: 'thin'  },
  dot:     { diameter: 1.5,                 fill: true,  stroke: 'thin'  },
});

/** Textbook spacings in mm. */
export const SPACING = Object.freeze({
  // ZERO. Fig. 4.1 carries an explicit leader annotation — "No gap is left here" — pointing
  // at the junction where the projection line meets the object outline. Some drawing offices
  // do leave a small gap; this textbook is the source of truth for this topic and it does
  // not. A projection line therefore springs directly off the feature it carries.
  extGap: 0,
  extOvershoot: 1.5,  // §4.6 rule 2 — 1 to 2 mm past the dimension line
  offFirst: 6,        // §4.3 — 5 to 6 mm clear of the object boundary
  offStep: 6,         // …and of the previous dimension line
  textGap: 1.0,       // §4.5 item 3 — 0.5 to 1 mm above the dimension line
  textHeight: 3.5,    // §4.5 item 3 / "Dimensional Text" — 3 to 4 mm
});

/**
 * The included angle currently in force for OPEN and CLOSED arrow heads, in degrees.
 * §4.1: "The included angle between short lines forming the arrow head may be taken between
 * 15° to 90°." The whole band is reachable from Step 1's angle slider; the textbook's own
 * recommendation for class work (§4.5 item 2) is about 15°, which is the default.
 * Render-scoped: `draw()` sets it before it strokes anything.
 */
let openAngleDeg = TERMINATION.open.includedDeg;

/**
 * Which termination the space between the projection lines actually allows — the decision
 * §4.1's termination rules 3, 4 and 5 describe, and §4.6 rule 7 repeats.
 *
 *   plenty  → arrow heads WITHIN the limits of the dimension line   (Fig. 4.7, left)
 *   tight   → arrow heads OUTSIDE the limits, pointing back in      (Fig. 4.7, the "4")
 *   none    → no room for a head at all: a dot or an oblique stroke (Fig. 4.8, §4.5 item 2)
 *
 * @param {number} spanMm  Distance between the projection lines, in mm at drawing scale.
 * @param {string} [style='open'] The drawing's chosen termination style.
 * @returns {{ fit:'plenty'|'tight'|'none', arrowsOutside:boolean, termination:string,
 *             headMm:number, rule:string, why:string }}
 */
export function fitDecision(spanMm, style = 'open') {
  const spec = TERMINATION[style] || TERMINATION.open;
  const headMm = spec.length ?? spec.diameter ?? 3.5;
  const both = headMm * 2;
  // Two heads have to fit between the projection lines, AND leave something between them:
  // §4.5 item 3 prints values 3–4 mm high, so about 6 mm of clear run is the practical floor.
  // Below the two heads' own combined length there is no room for a head at all, which is
  // precisely when §4.5 item 2 sends you to a 1.5 mm filled dot.
  if (spanMm >= both + 6) {
    return {
      fit: 'plenty', arrowsOutside: false, termination: style, headMm,
      rule: 'Plenty of room',
      why: 'There is space between the projection lines for both arrow heads, so they sit inside. The normal case.',
    };
  }
  if (spanMm >= both * 0.9) {
    return {
      fit: 'tight', arrowsOutside: true, termination: style, headMm,
      rule: 'Getting tight',
      why: 'The heads no longer fit between the lines. Put them outside, pointing back in, and run the dimension line out past them.',
    };
  }
  return {
    fit: 'none', arrowsOutside: false, termination: style === 'oblique' ? 'oblique' : 'dot', headMm,
    rule: 'No room at all',
    why: 'Too small for an arrow head either way. A filled dot about 1.5 mm across, or a short slash, takes its place.',
  };
}

/** Reveal choreography, as fractions of a spec's own 0→1 progress. The order is the order a
 *  draughtsman actually works in, which is the whole reason the animation exists. */
const PHASE = Object.freeze({
  extension: [0.00, 0.35], // projection lines grow off the feature
  line: [0.25, 0.72],      // dimension line draws outward from its middle
  termination: [0.72, 0.88], // arrowheads land last
  text: 0.88,              // the value appears once the line that carries it exists
});

/** Normalised sub-progress of a phase. */
function phase(t, [a, b]) {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return (t - a) / (b - a);
}

// ============================================================================
// Vector helpers (all in world units, all in the z = front-face plane)
// ============================================================================

const ZP = HALF_DEPTH + PROUD;

/** mm point → world {x, y}. */
const W = (p) => toWorld(p[0], p[1]);

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const perp = (a) => ({ x: -a.y, y: a.x });
const lerp2 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Push a straight segment a→b into a flat positions buffer. */
function seg(out, a, b) { out.push(a.x, a.y, ZP, b.x, b.y, ZP); }

/** Push a segment trimmed to `t` of its length, growing from `a`. */
function segGrow(out, a, b, t) {
  if (t <= 0) return;
  seg(out, a, t >= 1 ? b : lerp2(a, b, t));
}

/** Push a segment that grows OUTWARD from its own middle — how a dimension line is drawn. */
function segGrowFromMiddle(out, a, b, t) {
  if (t <= 0) return;
  const m = lerp2(a, b, 0.5);
  seg(out, m, lerp2(m, a, t));
  seg(out, m, lerp2(m, b, t));
}

/** Push a filled triangle into a triangle-soup buffer. */
function tri(out, a, b, c) {
  out.push(a.x, a.y, ZP, b.x, b.y, ZP, c.x, c.y, ZP);
}

/** Push a filled disc (a fan) of world radius r at p. */
function disc(out, p, r, steps = 12) {
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    tri(out,
      p,
      { x: p.x + Math.cos(a0) * r, y: p.y + Math.sin(a0) * r },
      { x: p.x + Math.cos(a1) * r, y: p.y + Math.sin(a1) * r });
  }
}

/**
 * Draw ONE termination at `tip`, pointing along unit `dir`, in the requested style.
 * `dir` points the way the arrow points (i.e. from the dimension line toward the limit).
 * Scale `k` in 0..1 lets the head grow in as the last beat of the reveal.
 */
function termination(buffers, style, tip, dir, k = 1) {
  if (k <= 0) return;
  const spec = TERMINATION[style] || TERMINATION.open;
  const n = perp(dir);

  if (style === 'dot') {
    disc(buffers.fill, tip, toUnits(spec.diameter / 2) * k);
    return;
  }
  if (style === 'oblique') {
    // A short stroke at 45° to the dimension line, centred on the tip (Fig. 4.5b).
    const a = spec.angleDeg * DEG;
    const d = { x: dir.x * Math.cos(a) - dir.y * Math.sin(a), y: dir.x * Math.sin(a) + dir.y * Math.cos(a) };
    const half = toUnits(spec.length / 2) * k;
    seg(buffers.thin, add(tip, mul(d, -half)), add(tip, mul(d, half)));
    return;
  }

  // §4.1: the included angle may be anywhere from 15° to 90°. An OPEN head is defined by its
  // angle; a CLOSED/FILLED head is defined by Fig. 4.6's length × width, and only widens with
  // the angle once the learner pushes it past the proportion the figure prints.
  const L0 = toUnits(spec.length);
  const byAngle = L0 * Math.tan((openAngleDeg / 2) * DEG);
  const halfW0 = spec.includedDeg !== undefined
    ? byAngle
    : Math.max(toUnits(spec.width / 2), byAngle);
  const L = L0 * k;
  const halfW = halfW0 * k;
  const back = add(tip, mul(dir, -L));
  const p1 = add(back, mul(n, halfW));
  const p2 = add(back, mul(n, -halfW));

  if (spec.fill) { tri(buffers.fill, tip, p1, p2); return; }
  const into = spec.stroke === 'thick' ? buffers.thick : buffers.thin;
  seg(into, tip, p1);
  seg(into, tip, p2);
  if (style === 'closed') seg(into, p1, p2); // closed = outlined triangle, not filled
}

/**
 * Where the dimensional text sits and how it is turned, for the two BIS methods.
 * Returns { at:{x,y}, rotationDeg, interrupt:boolean }.
 *
 * Method-1 (§4.2): parallel to the dimension line, ABOVE it, not touching, at the middle,
 * and readable from the bottom or the right — so a line whose direction points into the
 * left/lower half of the circle is read from the other end (a 180° flip).
 * Method-2 (§4.2): always horizontal, read from the bottom; above a HORIZONTAL dimension
 * line, and placed at the middle by INTERRUPTING a vertical or inclined one.
 */
function textPlacement(a, b, method, gapMm = SPACING.textGap + SPACING.textHeight / 2, viewRotationDeg = 0) {
  const dir = norm(sub(b, a));
  const mid = lerp2(a, b, 0.5);
  // Readability is judged on the SHEET, not in the part's own frame: when the drawing is
  // turned (Step 3), a dimension line that was horizontal is no longer horizontal to the
  // reader, and Method-1's "read from the bottom or the right" has to be re-decided.
  // CSS2DRenderer never rotates a label's DOM node, so the returned rotation is the full
  // screen-space angle while the text's OFFSET stays in the part's frame (it rides the
  // rotated group).
  let angle = Math.atan2(dir.y, dir.x) / DEG + viewRotationDeg;

  if (method === 2) {
    const horizontal = Math.abs(Math.sin(angle * DEG)) < 0.08;
    if (horizontal) {
      // "Above" means above ON THE SHEET, so take screen-up and rotate it back into the
      // part's frame (the label rides the rotated group).
      const th = viewRotationDeg * DEG;
      const up = { x: Math.sin(th), y: Math.cos(th) };
      return { at: add(mid, mul(up, toUnits(gapMm))), rotationDeg: 0, interrupt: false };
    }
    return { at: mid, rotationDeg: 0, interrupt: true };
  }

  // Method-1: fold the reading direction into (−90°, 90°] so the value reads from the
  // bottom edge or, for a vertical dimension line, from the right-hand edge.
  let flip = false;
  while (angle > 180) angle -= 360;
  while (angle <= -180) angle += 360;
  if (angle > 90 || angle <= -90) { angle += 180; flip = true; }
  while (angle > 180) angle -= 360;
  const outward = flip ? mul(perp(dir), -1) : perp(dir);
  return { at: add(mid, mul(outward, toUnits(gapMm))), rotationDeg: angle, interrupt: false };
}

// ============================================================================
// Spec rendering — one function per dimension KIND
// ============================================================================

/**
 * A linear dimension between two points on the part.
 * spec: { from:[mm], to:[mm], axis:'x'|'y'|'aligned', at:number (mm — the y of a horizontal
 *         dimension line, the x of a vertical one, or the perpendicular offset for
 *         'aligned'), text, termination, method, noExtension, extShort, extSkew,
 *         arrowsOutside, textOffsetMm }
 */
function drawLinear(spec, ctx) {
  const { buffers, labels, t, method, term, viewRotationDeg } = ctx;
  // `only` renders a single ELEMENT of the dimension (Step 1's anatomy inspector isolates
  // the projection lines, the dimension line, the termination and the text one at a time).
  const want = (k) => !spec.only || spec.only === k;
  const A = W(spec.from);
  const B = W(spec.to);

  let p, q;                 // the ends of the dimension line
  if (spec.axis === 'y') {
    const x = toWorld(spec.at, 0).x;
    p = { x, y: A.y }; q = { x, y: B.y };
  } else if (spec.axis === 'aligned') {
    const n = perp(norm(sub(B, A)));
    const o = mul(n, toUnits(spec.at ?? SPACING.offFirst));
    p = add(A, o); q = add(B, o);
  } else {
    const y = toWorld(0, spec.at).y;
    p = { x: A.x, y }; q = { x: B.x, y };
  }

  // --- Projection (extension) lines. §4.6 rule 2: they run from just clear of the feature
  //     to 1–2 mm PAST the dimension line. `extShort` renders the classic mistake — a
  //     projection line stopping short of the dimension line.
  const tExt = phase(t, PHASE.extension);
  if (!spec.noExtension && want('extension')) {
    for (const [feature, end] of [[A, p], [B, q]]) {
      let d = norm(sub(end, feature));
      if (spec.extSkew) {  // the "not perpendicular to the feature" mistake (§4.6 rule 4)
        const s = spec.extSkew * DEG;
        d = { x: d.x * Math.cos(s) - d.y * Math.sin(s), y: d.x * Math.sin(s) + d.y * Math.cos(s) };
      }
      const total = len(sub(end, feature));
      const start = add(feature, mul(d, toUnits(SPACING.extGap)));
      const stop = add(feature, mul(d, total + toUnits(spec.extShort ? -SPACING.extOvershoot * 2 : SPACING.extOvershoot)));
      segGrow(buffers.thin, start, stop, tExt);
    }
  }

  // --- Dimension line + its terminations.
  const tLine = phase(t, PHASE.line);
  const dir = norm(sub(q, p));
  const placement = textPlacement(p, q, method, spec.textOffsetMm, viewRotationDeg);

  if (!want('dimline')) {
    // fall through to the termination / text blocks below
  } else if (placement.interrupt && tLine > 0) {
    // Method-2 on a non-horizontal line: break it at the middle so the horizontal value
    // sits inside the gap (§4.2 Method-2, condition 2).
    const half = toUnits(SPACING.textHeight * 1.1);
    const mid = lerp2(p, q, 0.5);
    const gapA = add(mid, mul(dir, -half));
    const gapB = add(mid, mul(dir, half));
    segGrow(buffers.thin, gapA, p, tLine);
    segGrow(buffers.thin, gapB, q, tLine);
  } else {
    segGrowFromMiddle(buffers.thin, p, q, tLine);
  }

  const tTerm = want('termination') ? phase(t, PHASE.termination) : 0;
  const outside = !!spec.arrowsOutside;
  const stub = toUnits(SPACING.offStep); // the short run-out an outside arrow points along
  if (!want('termination') && !want('dimline')) {
    // nothing to stroke for this element
  } else if (outside) {
    // §4.1 rule 4 (Fig. 4.7): when the space between the projection lines is too small the
    // heads go OUTSIDE, pointing back in, with the dimension line run out past them.
    const tStub = want('dimline') ? tLine : 0;
    segGrow(buffers.thin, p, add(p, mul(dir, -stub)), tStub);
    segGrow(buffers.thin, q, add(q, mul(dir, stub)), tStub);
    if (spec.terminationEnds !== 'far') termination(buffers, term, p, dir, tTerm);
    termination(buffers, term, q, mul(dir, -1), tTerm);
  } else {
    // §4.3 item 4 — in superimposed running dimensioning only the FAR end of each
    // dimension line carries an arrow head; the near end springs from the marked origin.
    if (spec.terminationEnds !== 'far') termination(buffers, term, p, mul(dir, -1), tTerm);
    termination(buffers, term, q, dir, tTerm);
  }

  if (t >= PHASE.text && want('text')) {
    // `textNudgeMm` is how Step 2 shows a mis-placed value: the learner drags the pill and
    // the offset is fed straight back in, so the drawing shows exactly the illegal position.
    const nudge = spec.textNudgeMm
      ? { x: toUnits(spec.textNudgeMm[0]), y: toUnits(spec.textNudgeMm[1]) }
      : { x: 0, y: 0 };
    // Superimposed running puts the value at the FAR end, beside its one arrow head
    // (Fig. 4.17), not at the middle of the line.
    // Superimposed running dimensioning enters its values one of two ways (§4.3 item 4):
    //   Fig. 4.17(a) — TURNED, written along the projection line just past the arrow head;
    //   Fig. 4.17(b) — UPRIGHT, set clear above the single running line beside its one head.
    const turned = spec.textStyle === 'rotated';
    const base = turned
      ? add(q, mul(dir, toUnits(SPACING.textGap + SPACING.textHeight * 1.4)))
      : spec.textAt === 'far'
        ? add(q, mul(perp(dir), toUnits(SPACING.textGap + SPACING.textHeight)))
        : placement.at;
    labels.push({
      id: spec.id, text: spec.text, tone: spec.tone,
      position: new THREE.Vector3(base.x + nudge.x, base.y + nudge.y, ZP),
      rotationDeg: turned ? 90 : placement.rotationDeg,
      boxed: placement.interrupt,
      draggable: !!spec.draggable,
      title: spec.title,
    });
  }
}

/**
 * A leader line referring to a feature (§4.1 "Leader Lines", Fig. 4.4).
 * spec: { anchor:[mm], dirDeg, lengthMm, text, head:'arrow'|'dot'|'none', barMm, termination }
 */
function drawLeader(spec, ctx) {
  const { buffers, labels, t, term } = ctx;
  const want = (k) => !spec.only || spec.only === k;
  const a = W(spec.anchor);
  const d = { x: Math.cos((spec.dirDeg ?? 45) * DEG), y: Math.sin((spec.dirDeg ?? 45) * DEG) };
  const elbow = add(a, mul(d, toUnits(spec.lengthMm ?? 22)));
  const barDir = d.x >= 0 ? 1 : -1;
  const bar = add(elbow, { x: toUnits(spec.barMm ?? 10) * barDir, y: 0 });

  const tLine = phase(t, [PHASE.extension[0], PHASE.line[1]]);
  // The leader draws progressively from the feature outward, then the horizontal bar the
  // note sits on (§4.1: "the tail end should be terminated on a short horizontal bar").
  const totalA = toUnits(spec.lengthMm ?? 22);
  const totalB = Math.abs(toUnits(spec.barMm ?? 10));
  const total = totalA + totalB;
  const drawn = total * tLine;
  if (want('leader')) segGrow(buffers.thin, a, elbow, Math.min(1, drawn / totalA));
  if (want('note') && drawn > totalA && totalB > 0) {
    segGrow(buffers.thin, elbow, bar, (drawn - totalA) / totalB);
  }

  const tTerm = want('termination') ? phase(t, PHASE.termination) : 0;
  if (spec.head === 'dot') disc(buffers.fill, a, toUnits(TERMINATION.dot.diameter / 2) * tTerm);
  else if (spec.head !== 'none') termination(buffers, term, a, mul(d, -1), tTerm);

  // The lettering a leader carries belongs to exactly ONE element — §4.1 calls it the NOTE,
  // and ELEMENTS maps the note to these very specs. Accepting `text` as well would push the
  // same pill twice whenever Step 1 expands a drawing into its named parts.
  if (t >= PHASE.text && want('note')) {
    const at = add(bar, { x: toUnits(2) * barDir, y: toUnits(SPACING.textGap + SPACING.textHeight / 2) });
    labels.push({
      id: spec.id, text: spec.text, tone: spec.tone,
      position: new THREE.Vector3(at.x, at.y, ZP),
      rotationDeg: 0,
      anchorX: barDir > 0 ? 0 : 1,
      draggable: !!spec.draggable,
      title: spec.title,
    });
  }
}

/**
 * A diameter (Fig. 4.20/4.21). `mode`:
 *   'inside'  — dimension line straight across the circle through its centre, a head on
 *               each side, the value on the line.
 *   'outside' — the same line run out past the circle with the heads outside (small circles).
 *   'leader'  — a leader off the circumference carrying "Ø…" (Fig. 4.20, right-hand cases).
 * spec: { centre:[mm], diaMm, mode, dirDeg, text, method, termination }
 */
function drawDiameter(spec, ctx) {
  const { buffers, labels, t, method, term, viewRotationDeg } = ctx;
  const c = W(spec.centre);
  const r = toUnits(spec.diaMm / 2);
  const ang = (spec.dirDeg ?? 45) * DEG;
  const d = { x: Math.cos(ang), y: Math.sin(ang) };
  const p = add(c, mul(d, -r));
  const q = add(c, mul(d, r));

  if (spec.mode === 'leader') {
    drawLeader({
      ...spec,
      anchor: [spec.centre[0] + Math.cos(ang) * (spec.diaMm / 2),
        spec.centre[1] + Math.sin(ang) * (spec.diaMm / 2)],
      dirDeg: spec.dirDeg ?? 45,
      lengthMm: spec.lengthMm ?? 20,
      head: 'arrow',
    }, ctx);
    return;
  }

  const tLine = phase(t, PHASE.line);
  const tTerm = phase(t, PHASE.termination);
  const outside = spec.mode === 'outside';
  if (outside) {
    const stub = toUnits(SPACING.offStep);
    segGrowFromMiddle(buffers.thin, add(p, mul(d, -stub)), add(q, mul(d, stub)), tLine);
    termination(buffers, term, p, d, tTerm);
    termination(buffers, term, q, mul(d, -1), tTerm);
  } else {
    segGrowFromMiddle(buffers.thin, p, q, tLine);
    termination(buffers, term, p, mul(d, -1), tTerm);
    termination(buffers, term, q, d, tTerm);
  }

  if (t >= PHASE.text) {
    const placement = textPlacement(p, q, method, undefined, viewRotationDeg);
    labels.push({
      id: spec.id, text: spec.text, tone: spec.tone,
      position: new THREE.Vector3(placement.at.x, placement.at.y, ZP),
      rotationDeg: placement.rotationDeg,
      boxed: placement.interrupt,
      draggable: !!spec.draggable,
    });
  }
}

/**
 * A radius (§4.1 rule 6 + Fig. 4.22): ONE arrowhead only, terminated on the feature
 * outline, with the value carrying the R prefix.
 * spec: { centre:[mm], radiusMm, dirDeg, text, fromCentre:boolean, text }
 */
function drawRadius(spec, ctx) {
  const { buffers, labels, t, term } = ctx;
  const c = W(spec.centre);
  const ang = (spec.dirDeg ?? 45) * DEG;
  const d = { x: Math.cos(ang), y: Math.sin(ang) };
  const onArc = add(c, mul(d, toUnits(spec.radiusMm)));
  const start = spec.fromCentre === false
    ? add(c, mul(d, toUnits(spec.radiusMm) + toUnits(spec.leadMm ?? 16)))
    : c;

  const tLine = phase(t, PHASE.line);
  segGrow(buffers.thin, start, onArc, tLine);
  // A small cross marks the centre when the dimension is taken from it (Fig. 4.22).
  if (spec.fromCentre !== false && tLine > 0) {
    const k = toUnits(2);
    seg(buffers.thin, { x: c.x - k, y: c.y }, { x: c.x + k, y: c.y });
    seg(buffers.thin, { x: c.x, y: c.y - k }, { x: c.x, y: c.y + k });
  }
  termination(buffers, term, onArc, spec.fromCentre === false ? mul(d, -1) : d,
    phase(t, PHASE.termination));

  if (t >= PHASE.text) {
    const at = lerp2(start, onArc, spec.fromCentre === false ? 1.15 : 0.55);
    const placement = textPlacement(start, onArc, ctx.method, undefined, ctx.viewRotationDeg);
    labels.push({
      id: spec.id, text: spec.text, tone: spec.tone,
      position: new THREE.Vector3(
        spec.fromCentre === false ? at.x : placement.at.x,
        spec.fromCentre === false ? at.y : placement.at.y, ZP),
      rotationDeg: ctx.method === 2 ? 0 : placement.rotationDeg,
      draggable: !!spec.draggable,
    });
  }
}

/**
 * An angular dimension (Figs. 4.11/4.13): a circular dimension line about a vertex with a
 * head at each end. Method-1 turns the value with the arc; Method-2 keeps it horizontal.
 * spec: { vertex:[mm], radiusMm, fromDeg, toDeg, text }
 */
function drawAngular(spec, ctx) {
  const { buffers, labels, t, method, term, viewRotationDeg } = ctx;
  const v = W(spec.vertex);
  const r = toUnits(spec.radiusMm ?? 18);
  const a0 = spec.fromDeg * DEG;
  const a1 = spec.toDeg * DEG;
  const tLine = phase(t, PHASE.line);
  const steps = 28;
  const aMid = (a0 + a1) / 2;
  for (let i = 0; i < steps; i++) {
    // Grow outward from the middle of the arc, like a straight dimension line.
    const f0 = (i / steps) * 2 - 1;
    const f1 = ((i + 1) / steps) * 2 - 1;
    if (Math.abs(f0) > tLine && Math.abs(f1) > tLine) continue;
    const b0 = aMid + (a1 - a0) / 2 * Math.max(-tLine, Math.min(tLine, f0));
    const b1 = aMid + (a1 - a0) / 2 * Math.max(-tLine, Math.min(tLine, f1));
    seg(buffers.thin,
      { x: v.x + Math.cos(b0) * r, y: v.y + Math.sin(b0) * r },
      { x: v.x + Math.cos(b1) * r, y: v.y + Math.sin(b1) * r });
  }
  const tTerm = phase(t, PHASE.termination);
  const endA = { x: v.x + Math.cos(a0) * r, y: v.y + Math.sin(a0) * r };
  const endB = { x: v.x + Math.cos(a1) * r, y: v.y + Math.sin(a1) * r };
  const tanA = { x: Math.sin(a0), y: -Math.cos(a0) };
  const tanB = { x: -Math.sin(a1), y: Math.cos(a1) };
  termination(buffers, term, endA, a1 > a0 ? tanA : mul(tanA, -1), tTerm);
  termination(buffers, term, endB, a1 > a0 ? tanB : mul(tanB, -1), tTerm);

  if (t >= PHASE.text) {
    const at = { x: v.x + Math.cos(aMid) * (r + toUnits(4)), y: v.y + Math.sin(aMid) * (r + toUnits(4)) };
    // §4.2 Method-1 condition 7: an angular value is indicated "either as in Fig. 4.11(a) or
    // in Fig. 4.11(b). Here, the second one is simple, hence suggested for class work."
    //   (a) ALIGNED  — the value lies along its own arc, like every other Method-1 value.
    //   (b) SIMPLE   — the value is written upright wherever it sits on the circle.
    // Method-2 is always upright by definition (Fig. 4.13).
    const style = spec.angularStyle || ctx.angularStyle || 'a';
    let rot = 0;
    if (method === 1 && style === 'a') {
      rot = (aMid / DEG) - 90 + (viewRotationDeg || 0);
      while (rot > 90) rot -= 180;
      while (rot <= -90) rot += 180;
    }
    labels.push({
      id: spec.id, text: spec.text, tone: spec.tone,
      position: new THREE.Vector3(at.x, at.y, ZP),
      rotationDeg: rot,
    });
  }
}

/**
 * An arc-length dimension (Fig. 4.25b): the dimension line is CONCENTRIC with the arc and
 * the value carries the ⌒ arc symbol. The chord case (Fig. 4.25a) is just a linear
 * dimension between the arc's ends, so it needs no separate kind.
 * spec: { centre:[mm], radiusMm, fromDeg, toDeg, offsetMm, text }
 */
function drawArcLength(spec, ctx) {
  // An arc dimension is an angular dimension about the arc's OWN centre, run at a larger
  // radius so the curved dimension line sits outside the feature.
  drawAngular({
    ...spec,
    vertex: spec.vertex || spec.centre,
    radiusMm: spec.radiusMm + (spec.offsetMm ?? SPACING.offFirst),
  }, ctx);
}

/**
 * The origin marker for superimposed running dimensioning (Figs. 4.17/4.18): a small open
 * circle on the datum. §4.3 item 4 — "origin is to be indicated appropriately and the
 * opposite end of each dimension line should be terminated only with an arrow head."
 * spec: { at:[mm] }
 */
function drawOrigin(spec, ctx) {
  const { buffers, t } = ctx;
  if (t <= 0) return;
  const c = W(spec.at);
  const r = toUnits(1.6) * Math.min(1, t * 2);
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    seg(buffers.thin,
      { x: c.x + Math.cos(a0) * r, y: c.y + Math.sin(a0) * r },
      { x: c.x + Math.cos(a1) * r, y: c.y + Math.sin(a1) * r });
  }
}

/**
 * A co-ordinate marker (Fig. 4.19a): a numbered point on the feature whose x/y/Ø are read
 * off the accompanying table rather than off dimension lines.
 * spec: { at:[mm], text }
 */
function drawCoordinate(spec, ctx) {
  const { buffers, labels, t } = ctx;
  if (t <= 0) return;
  const c = W(spec.at);
  const k = toUnits(3) * Math.min(1, t * 2);
  if (spec.mode === 'values') {
    // Fig. 4.19(b): no table at all — each point carries its own "x = …" and "y = …" beside
    // a small open circle, so the view is read directly.
    const r = toUnits(1.6) * Math.min(1, t * 2);
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      seg(buffers.thin,
        { x: c.x + Math.cos(a0) * r, y: c.y + Math.sin(a0) * r },
        { x: c.x + Math.cos(a1) * r, y: c.y + Math.sin(a1) * r });
    }
  } else {
    seg(buffers.thin, { x: c.x - k, y: c.y }, { x: c.x + k, y: c.y });
    seg(buffers.thin, { x: c.x, y: c.y - k }, { x: c.x, y: c.y + k });
  }
  if (t >= PHASE.text) {
    const off = toUnits(spec.mode === 'values' ? 3.5 : 5);
    labels.push({
      id: spec.id, text: spec.text, tone: spec.tone,
      position: new THREE.Vector3(c.x + off, c.y + off, ZP),
      rotationDeg: 0,
      anchorX: spec.mode === 'values' ? 0 : undefined,
    });
  }
}

/** A plain guide/aid stroke used by the rule demos (e.g. the outline a wrong dimension is
 *  drawn ON). spec: { from:[mm], to:[mm], dashed:boolean } */
function drawAid(spec, ctx) {
  const { buffers, t } = ctx;
  if (t <= 0) return;
  segGrow(spec.dashed ? buffers.aid : buffers.thin, W(spec.from), W(spec.to), Math.min(1, t * 2));
}

/**
 * The conventional BREAK of Fig. 4.3. A long feature of constant section is drawn shortened,
 * with the removed middle marked by a pair of break lines — and §4.1 Dimension Lines rule 4
 * then insists the dimension line across it stays UNBROKEN and carries the true length.
 * spec: { kind:'break', atMm:number, fromMm:number, toMm:number, ampMm?:number, gapMm?:number }
 */
function drawBreak(spec, ctx) {
  const { buffers, t } = ctx;
  if (t <= 0) return;
  const amp = toUnits(spec.ampMm ?? 3);
  const gap = toUnits(spec.gapMm ?? 7);
  const a = W([spec.atMm, spec.fromMm]);
  const b = W([spec.atMm, spec.toMm]);
  const midY = (a.y + b.y) / 2;
  const k = amp * 1.4;

  for (const dx of [-gap / 2, gap / 2]) {
    const x = a.x + dx;
    const pts = [
      { x, y: a.y },
      { x, y: midY - k },
      { x: x + amp, y: midY - k / 2 },
      { x: x - amp, y: midY + k / 2 },
      { x, y: midY + k },
      { x, y: b.y },
    ];
    for (let i = 0; i < pts.length - 1; i++) segGrow(buffers.thin, pts[i], pts[i + 1], 1);
  }
}

/**
 * A hatched (sectioned) region, for §4.6 rule 8: "if dimensioning inside a hatched portion is
 * unavoidable, the hatching lines should not cross the dimensional text". `clear` is the box
 * the hatching must step around; omit it and the hatching runs straight through the value,
 * which is the violation.
 * spec: { kind:'hatch', rect:[x0,y0,x1,y1], pitchMm?, angleDeg?, clear?:[x,y,w,h] }
 */
function drawHatch(spec, ctx) {
  const { buffers, t } = ctx;
  if (t <= 0) return;
  const [x0, y0, x1, y1] = spec.rect;
  const pitch = toUnits(spec.pitchMm ?? 4);
  const ang = (spec.angleDeg ?? 45) * DEG;
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  const nrm = perp(dir);
  const lo = W([Math.min(x0, x1), Math.min(y0, y1)]);
  const hi = W([Math.max(x0, x1), Math.max(y0, y1)]);
  const corners = [
    { x: lo.x, y: lo.y }, { x: hi.x, y: lo.y }, { x: hi.x, y: hi.y }, { x: lo.x, y: hi.y },
  ];
  const cs = corners.map((c) => c.x * nrm.x + c.y * nrm.y);
  const ds = corners.map((c) => c.x * dir.x + c.y * dir.y);
  const cMin = Math.min(...cs);
  const cMax = Math.max(...cs);
  const dMin = Math.min(...ds);
  const dMax = Math.max(...ds);

  const clear = spec.clear
    ? (() => {
      const c = W([spec.clear[0], spec.clear[1]]);
      const hw = toUnits(spec.clear[2]) / 2;
      const hh = toUnits(spec.clear[3]) / 2;
      return { x0: c.x - hw, x1: c.x + hw, y0: c.y - hh, y1: c.y + hh };
    })()
    : null;

  const inside = (p) => p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y;
  const blocked = (p) => !!clear && p.x >= clear.x0 && p.x <= clear.x1 && p.y >= clear.y0 && p.y <= clear.y1;

  const STEPS = 90;
  for (let c = Math.ceil(cMin / pitch) * pitch; c <= cMax; c += pitch) {
    let run = null;
    for (let i = 0; i <= STEPS; i++) {
      const d = dMin + ((dMax - dMin) * i) / STEPS;
      const p = { x: nrm.x * c + dir.x * d, y: nrm.y * c + dir.y * d };
      const ok = inside(p) && !blocked(p);
      if (ok && !run) run = p;
      else if (!ok && run) { seg(buffers.thin, run, p); run = null; }
    }
    if (run) {
      const p = { x: nrm.x * c + dir.x * dMax, y: nrm.y * c + dir.y * dMax };
      seg(buffers.thin, run, p);
    }
  }
}

/**
 * A LARGE radius whose centre falls outside the drawing (Fig. 4.22, the R120 cases). The
 * dimension line still lies along a true radius where it meets the arc, is then broken and
 * offset toward a false centre so the value can be written on the sheet, and — as always for
 * a radius — carries exactly ONE arrow head, terminated on the feature outline.
 * spec: { centre:[mm], radiusMm, onArcDeg, jogMm?, falseCentre:[mm], text }
 */
function drawRadiusLarge(spec, ctx) {
  const { buffers, labels, t, term } = ctx;
  const c = W(spec.centre);
  const ang = (spec.onArcDeg ?? 90) * DEG;
  const d = { x: Math.cos(ang), y: Math.sin(ang) };
  const onArc = add(c, mul(d, toUnits(spec.radiusMm)));
  const jog = add(onArc, mul(d, -toUnits(spec.jogMm ?? 14)));
  const f = W(spec.falseCentre);

  const tLine = phase(t, PHASE.line);
  segGrow(buffers.thin, onArc, jog, tLine);          // the true-radius stub at the arc
  segGrow(buffers.thin, jog, f, tLine);              // the offset leg, broken away from it
  termination(buffers, term, onArc, d, phase(t, PHASE.termination));

  if (t >= PHASE.text) {
    const at = lerp2(jog, f, 0.5);
    const up = toUnits(SPACING.textGap + SPACING.textHeight);
    labels.push({
      id: spec.id, text: spec.text, tone: spec.tone,
      position: new THREE.Vector3(at.x, at.y + up, ZP),
      rotationDeg: 0,
    });
  }
}

const RENDERERS = {
  linear: drawLinear,
  leader: drawLeader,
  diameter: drawDiameter,
  radius: drawRadius,
  radiusLarge: drawRadiusLarge,
  angular: drawAngular,
  arcLength: drawArcLength,
  origin: drawOrigin,
  coordinate: drawCoordinate,
  break: drawBreak,
  hatch: drawHatch,
  aid: drawAid,
};

// ============================================================================
// Public factory
// ============================================================================

/**
 * Create the dimension-drawing layer.
 *
 * @param {Object} [options]
 * @param {number} [options.width=1]
 * @param {number} [options.height=1]
 * @returns {{
 *   group: THREE.Group,
 *   draw: (specs: object[], opts?: { method?: 1|2, termination?: string, progress?: object }) => object[],
 *   setResolution: (w: number, h: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createDimensionLayer(options = {}) {
  const { width = 1, height = 1 } = options;
  const resolution = new THREE.Vector2(width, height);

  const group = new THREE.Group();
  group.name = 'Dimension apparatus';

  const TONES = {
    ink: cssColor('--color-ink'),
    muted: cssColor('--color-bench-grey'),
    bad: cssColor('--color-flag-wrong'),
    good: cssColor('--color-flag-right'),
  };

  /** One set of fat-line + triangle batches per tone, rebuilt on every draw(). */
  let built = [];

  function clear() {
    for (const obj of built) {
      obj.geometry?.dispose();
      obj.material?.dispose();
      group.remove(obj);
    }
    built = [];
  }

  function addLines(positions, color, widthPx, { dashed = false } = {}) {
    if (!positions.length) return;
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color: color.getHex(), linewidth: widthPx, dashed,
      dashSize: AID_DASH.size, gapSize: AID_DASH.gap,
    });
    material.resolution.copy(resolution);
    const lines = new LineSegments2(geometry, material);
    if (dashed) lines.computeLineDistances(); // RULES.md §3.17
    lines.frustumCulled = false;
    lines.renderOrder = 3;
    group.add(lines);
    built.push(lines);
  }

  function addFill(positions, color) {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.MeshBasicMaterial({ color: color.getHex(), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    built.push(mesh);
  }

  return {
    group,

    /**
     * Render a set of specs. Returns the CSS2D label descriptors so main.js can hand them
     * to the label layer (the two never import each other — ADR-007 star rule).
     *
     * @param {object[]} specs
     * @param {Object} [opts]
     * @param {1|2} [opts.method=1]            BIS method for the dimensional text.
     * @param {string} [opts.termination='open'] Termination style for the whole drawing —
     *   §4.1: "Only one style of arrow head termination should be used on a single drawing."
     * @param {Record<string, number>} [opts.progress] Per-spec reveal in 0..1 (default 1).
     * @returns {object[]} label descriptors
     */
    draw(specs, opts = {}) {
      clear();
      const method = opts.method === 2 ? 2 : 1;
      const defaultTerm = opts.termination || 'open';
      const progress = opts.progress || null;
      // §4.1 allows 15°–90°; anything outside that band is not a BIS arrow head at all.
      openAngleDeg = Math.min(90, Math.max(15,
        opts.terminationAngleDeg ?? TERMINATION.open.includedDeg));

      /** @type {Record<string, {thin:number[],thick:number[],fill:number[],aid:number[]}>} */
      const byTone = {};
      const labels = [];

      for (const spec of specs) {
        if (!spec || spec.hidden) continue;
        const render = RENDERERS[spec.kind];
        if (!render) continue;
        const tone = spec.tone && TONES[spec.tone] ? spec.tone : 'ink';
        byTone[tone] ??= { thin: [], thick: [], fill: [], aid: [] };
        const t = progress ? (progress[spec.id] ?? 1) : 1;
        if (t <= 0) continue;
        render(spec, {
          buffers: byTone[tone],
          labels,
          t,
          method: spec.method || method,
          term: spec.termination || defaultTerm,
          viewRotationDeg: opts.viewRotationDeg || 0,
          angularStyle: opts.angularStyle || 'a',
        });
      }

      for (const [tone, buffers] of Object.entries(byTone)) {
        const color = TONES[tone];
        addLines(buffers.thin, color, WIDTH_PX.thin);
        addLines(buffers.thick, color, WIDTH_PX.thick);
        addLines(buffers.aid, color, WIDTH_PX.thin, { dashed: true });
        addFill(buffers.fill, color);
      }
      return labels;
    },

    setResolution(w, h) {
      resolution.set(w, h);
      for (const obj of built) {
        if (obj.material instanceof LineMaterial) obj.material.resolution.copy(resolution);
      }
    },

    dispose() {
      clear();
      group.parent?.remove(group);
    },
  };
}
