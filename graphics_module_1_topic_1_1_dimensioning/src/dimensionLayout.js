// The annotation LAYOUT pass (Module 1 Topic 1.1 — Dimensioning).
//
// A draughtsman does not place a dimension once and walk away. They place it, look at what it
// landed next to, and shift whichever of the two matters less. This module is that second look,
// done automatically: given the same declarative SPECS `dimensionDraw.js` is about to render, it
// works out where every stroke and every value will actually fall, finds the pairs that are
// touching or too close, and moves the LOWER-PRIORITY one until they are not.
//
// WHAT IT MAY CHANGE, AND WHAT IT MAY NOT
//   It only ever edits WHERE AN ANNOTATION IS DRAWN. The geometry, the measured points, the
//   values and the drafting conventions are untouched:
//     • a straight dimension's LANE may move further out from the part      (§4.3 — 5-6 mm min)
//     • a sloping dimension's OFFSET from its face may grow or shrink       (§4.3)
//     • an angular arc's RADIUS may shrink, or its value move further out   (Fig. 4.11 — free)
//     • a leader may get LONGER, or be re-aimed within 20°                  (§4.1 — 30° or more)
//     • a value may slide along its own dimension line                      (last resort)
//   `from`, `to`, `text`, `kind`, the termination style and the method are never touched, so the
//   drawing still states exactly the same sizes, measured between exactly the same points.
//
// THE CLEARANCE. The chapter prints no number for "how far apart two neighbouring annotations
// should be", so this one is derived from what it DOES print: §4.5 item 3 letters a value 3 to
// 4 mm high. One letter-height of air — the chapter's own lower bound, 3 mm — is therefore the
// smallest gap that still reads as two separate things rather than one smudge. The SAME number
// is used for every pair (text↔text, text↔arrow, arrow↔arrow, arc↔line, leader↔dimension), so
// the spacing is consistent across the whole sheet, which is what makes a drawing look drawn by
// one hand.
//
// WHAT IS NOT A COLLISION. Five things that legitimately meet are exempt:
//   • anything belonging to the SAME spec — a value sits 1 mm off its own line ON PURPOSE
//   • two dimensions that SHARE A LIMIT — a chain's neighbours use one projection line and put
//     their arrow heads back to back on it (Fig. 4.15), and superimposed running dimensioning
//     draws every one of its dimension lines on top of the last (Fig. 4.17). Those are the
//     arrangements, not faults, and a pass that "fixed" them would destroy Step 4.
//   • two strokes drawn ALONG THE SAME LINE — one line, drawn twice, is still one line
//   • a PROJECTION LINE crossing another projection line or a dimension line — every stacked
//     arrangement in §4.3 does this, four rows deep in Fig. 4.16
//   • the LANDING of a leader, the first 6 mm of it, which exists to touch something
// Two VALUES are exempt from none of it: a number that touches another number is unreadable
// however lawful the lines beneath it are.
//
// WHAT IS EXCLUDED ENTIRELY. A drawing that is MEANT to be wrong must stay wrong: a spec that is
// flagged `bad`/`good`, that carries one of the deliberate-fault knobs (`extShort`, `extSkew`,
// `textNudgeMm`), or that is `pinned` takes no part — it is neither moved nor avoided. Step 2's
// ten broken rules and Step 6's twelve seeded faults are the whole lesson of those steps.
//
// Layering (ADR-007 / RULES.md §3.6): PURE LEAF. Imports only the pure-data `dimensionData.js`
// (ADR-078). No THREE, no DOM, no scene. `dimensionDraw.js` imports the geometry helpers,
// `SPACING` and `TERMINATION` from here so the boxes this module reasons about and the strokes
// that module emits can never be computed two different ways.

import { toWorld, toUnits, MM_PER_UNIT } from './dimensionData.js';

/** World units → mm, for reporting a gap in the unit the rules are written in. */
const toMm = (units) => units * MM_PER_UNIT;

const DEG = Math.PI / 180;

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
 * The one clearance, in mm, demanded between any two annotations that do not belong together.
 * See the header: it is §4.5's own lower bound for the height of a value.
 */
export const CLEARANCE_MM = 3;

/**
 * How big a value's box is on the SHEET, in mm — the drafting size, not the CSS pixel size.
 * §4.5 item 3 letters at 3–4 mm; single-stroke drawing lettering runs about 0.6 of its height
 * wide, and the pill the renderer draws carries a hair of padding either side. Reasoning in
 * drawing millimetres rather than screen pixels is deliberate: the layout of a drawing must not
 * change when the camera zooms.
 */
export const TEXT_METRICS = Object.freeze({ heightMm: 3.5, perCharMm: 2.1, padMm: 0.8 });

/**
 * Which annotation gives way. LOWER NUMBER = more important = moved last.
 *
 * The order is by how much freedom each kind actually has, which is also the order a
 * draughtsman would defend them in:
 *   1 a dimension on a SLOPING face can only live parallel to that face, a set distance off it —
 *     it defines the feature and it has almost nowhere else to be (a chamfer, a taper);
 *   2 an angular dimension must stay in its own corner, but its arc may be any radius;
 *   3 a straight dimension can always move to the next lane out;
 *   4 a note on a leader can be re-routed to any clear paper on the sheet.
 */
export const PRIORITY = Object.freeze({
  aligned: 1, angular: 2, arcLength: 2,
  linear: 3, diameter: 3, radius: 3, radiusLarge: 3,
  leader: 4, coordinate: 5, origin: 5,
});

// ============================================================================
// Vector helpers (world units, z = the sheet plane). Shared with dimensionDraw.js.
// ============================================================================

/** mm point → world {x, y}. */
export const W = (p) => toWorld(p[0], p[1]);

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const len = (a) => Math.hypot(a.x, a.y);
export const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = (a) => ({ x: -a.y, y: a.x });
export const lerp2 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * The two ends of a linear spec's DIMENSION LINE, and the two feature points it springs from.
 * Shared by the renderer and this pass so a projection line can never be drawn to one place and
 * reasoned about in another.
 *
 * @param {object} spec
 * @returns {{ A:{x,y}, B:{x,y}, p:{x,y}, q:{x,y} }} A/B on the part, p/q on the dimension line.
 */
export function linearEnds(spec) {
  const A = W(spec.from);
  const B = W(spec.to);
  if (spec.axis === 'y') {
    const x = toWorld(spec.at, 0).x;
    return { A, B, p: { x, y: A.y }, q: { x, y: B.y } };
  }
  if (spec.axis === 'aligned') {
    const n = perp(norm(sub(B, A)));
    const o = mul(n, toUnits(spec.at ?? SPACING.offFirst));
    return { A, B, p: add(A, o), q: add(B, o) };
  }
  const y = toWorld(0, spec.at).y;
  return { A, B, p: { x: A.x, y }, q: { x: B.x, y } };
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
export function textPlacement(a, b, method, gapMm = SPACING.textGap + SPACING.textHeight / 2, viewRotationDeg = 0) {
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

/** Where an angular spec's value sits, and how far its arc is from the vertex. */
export function angularTextRadius(spec) {
  return toUnits((spec.radiusMm ?? 18) + (spec.textGapMm ?? 4));
}

// ============================================================================
// Shapes — what each spec will actually put on the paper
// ============================================================================

/** The world-unit box a value occupies, at drafting size. Multi-line notes stack. */
function textSize(text) {
  const lines = String(text ?? '').split('\n');
  const chars = Math.max(...lines.map((l) => l.length), 1);
  return {
    w: toUnits(TEXT_METRICS.padMm * 2 + chars * TEXT_METRICS.perCharMm),
    h: toUnits(lines.length * TEXT_METRICS.heightMm),
  };
}

/** A rectangle as four world points, centred at `c`, turned `rotationDeg`. */
function rect(c, w, h, rotationDeg = 0, anchorX = 0.5) {
  const a = rotationDeg * DEG;
  const ux = { x: Math.cos(a), y: Math.sin(a) };
  const uy = { x: -Math.sin(a), y: Math.cos(a) };
  // anchorX 0 = the point is the LEFT edge, 1 = the right edge, 0.5 = the middle.
  const shift = (0.5 - anchorX) * w;
  const m = add(c, mul(ux, shift));
  return [
    add(add(m, mul(ux, -w / 2)), mul(uy, -h / 2)),
    add(add(m, mul(ux, w / 2)), mul(uy, -h / 2)),
    add(add(m, mul(ux, w / 2)), mul(uy, h / 2)),
    add(add(m, mul(ux, -w / 2)), mul(uy, h / 2)),
  ];
}

/** The triangle an arrow head fills, tip at `tip`, pointing along `dir`. */
function arrowPoly(tip, dir, style, angleDeg) {
  const spec = TERMINATION[style] || TERMINATION.open;
  if (style === 'dot') {
    const r = toUnits(spec.diameter / 2);
    return rect(tip, r * 2, r * 2, 0);
  }
  const n = perp(dir);
  const L = toUnits(spec.length);
  const byAngle = L * Math.tan((angleDeg / 2) * DEG);
  const halfW = spec.includedDeg !== undefined ? byAngle : Math.max(toUnits(spec.width / 2), byAngle);
  const back = add(tip, mul(dir, -L));
  return [tip, add(back, mul(n, halfW)), add(back, mul(n, -halfW))];
}

const segment = (a, b) => [a, b];

/**
 * Every convex shape one spec will put on the paper, tagged with the ROLE the brief's clearance
 * table names. `method` decides only where the value sits, so the pass is run for BOTH methods
 * and the results unioned — a drawing must not re-lay itself out when the learner switches
 * between aligned and unidirectional values.
 *
 * @param {object} spec
 * @param {{ method:1|2, termination:string, angleDeg:number, angularStyle:'a'|'b' }} ctx
 * @returns {Array<{ role:string, pts:{x,y}[] }>}
 */
function shapesFor(spec, ctx) {
  const out = [];
  const push = (role, pts) => out.push({ role, pts });
  const term = spec.termination || ctx.termination;
  const arrow = (tip, dir) => push('arrow', arrowPoly(tip, dir, term, ctx.angleDeg));
  const value = (centre, rotationDeg, anchorX) => {
    if (spec.text === undefined || spec.text === null || spec.text === '') return;
    const { w, h } = textSize(spec.text);
    push('text', rect(centre, w, h, rotationDeg, anchorX));
  };

  switch (spec.kind) {
    case 'linear': {
      const { A, B, p, q } = linearEnds(spec);
      const dir = norm(sub(q, p));
      if (!spec.noExtension) {
        for (const [feature, end] of [[A, p], [B, q]]) {
          const d = norm(sub(end, feature));
          const total = len(sub(end, feature));
          push('ext', segment(feature, add(feature, mul(d, total + toUnits(SPACING.extOvershoot)))));
        }
      }
      push('dim', segment(p, q));
      const stub = toUnits(SPACING.offStep);
      if (spec.arrowsOutside) {
        push('dim', segment(p, add(p, mul(dir, -stub))));
        push('dim', segment(q, add(q, mul(dir, stub))));
        if (spec.terminationEnds !== 'far') arrow(p, dir);
        arrow(q, mul(dir, -1));
      } else {
        if (spec.terminationEnds !== 'far') arrow(p, mul(dir, -1));
        arrow(q, dir);
      }
      const slide = spec.textAlongMm ? mul(dir, toUnits(spec.textAlongMm)) : { x: 0, y: 0 };
      const turned = spec.textStyle === 'rotated';
      for (const method of [1, 2]) {
        const pl = textPlacement(p, q, method, spec.textOffsetMm, 0);
        const base = turned
          ? add(q, mul(dir, toUnits(SPACING.textGap + SPACING.textHeight * 1.4)))
          : spec.textAt === 'far'
            ? add(q, mul(perp(dir), toUnits(SPACING.textGap + SPACING.textHeight)))
            : pl.at;
        value(add(base, slide), turned ? 90 : pl.rotationDeg);
      }
      break;
    }

    case 'leader': {
      const a = W(spec.anchor);
      const d = { x: Math.cos((spec.dirDeg ?? 45) * DEG), y: Math.sin((spec.dirDeg ?? 45) * DEG) };
      const elbow = add(a, mul(d, toUnits(spec.lengthMm ?? 22)));
      const barDir = d.x >= 0 ? 1 : -1;
      const bar = add(elbow, { x: toUnits(spec.barMm ?? 10) * barDir, y: 0 });
      // THE LANDING IS NOT A COLLISION. A leader exists to touch something — an edge, a hole, or
      // (Fig. 4.4c, the headless case) a dimension line whose SIZE the note qualifies. So the
      // first clearance-width of the leader, the part that does the landing, is not tested;
      // everything from there to the bar is.
      // Two clearances of leader are the landing: §4.1 asks a leader to leave its feature at 30°
      // or steeper, and at exactly 30° it takes 2 × 3 mm of leader to get 3 mm clear of what it
      // is pointing at. Anything steeper is clear sooner.
      const landing = toUnits(CLEARANCE_MM * 2);
      const total = toUnits(spec.lengthMm ?? 22);
      push('leader', segment(add(a, mul(d, Math.min(landing, total))), elbow));
      push('leader', segment(elbow, bar));
      if (spec.head && spec.head !== 'none') arrow(a, mul(d, -1));
      const at = add(bar, { x: toUnits(2) * barDir, y: toUnits(SPACING.textGap + SPACING.textHeight / 2) });
      value(at, 0, barDir > 0 ? 0 : 1);
      break;
    }

    case 'diameter': {
      if (spec.mode === 'leader') {
        // The span across the circle PLUS the leader that carries its value out — see
        // `drawDiameter` in dimensionDraw.js, which this mirrors stroke for stroke.
        const c = W(spec.centre);
        const r = toUnits(spec.diaMm / 2);
        const ang = (spec.dirDeg ?? 45) * DEG;
        const d = { x: Math.cos(ang), y: Math.sin(ang) };
        const p = add(c, mul(d, -r));
        const q = add(c, mul(d, r));
        push('dim', segment(p, q));
        arrow(p, mul(d, -1));
        arrow(q, d);
        const elbow = add(q, mul(d, toUnits(spec.lengthMm ?? 20)));
        const barDir = d.x >= 0 ? 1 : -1;
        const bar = add(elbow, { x: toUnits(spec.barMm ?? 10) * barDir, y: 0 });
        const landing = toUnits(CLEARANCE_MM * 2);
        const run = toUnits(spec.lengthMm ?? 20);
        push('leader', segment(add(q, mul(d, Math.min(landing, run))), elbow));
        push('leader', segment(elbow, bar));
        const at = add(bar, { x: toUnits(2) * barDir, y: toUnits(SPACING.textGap + SPACING.textHeight / 2) });
        value(at, 0, barDir > 0 ? 0 : 1);
        break;
      }
      const c = W(spec.centre);
      const r = toUnits(spec.diaMm / 2);
      const ang = (spec.dirDeg ?? 45) * DEG;
      const d = { x: Math.cos(ang), y: Math.sin(ang) };
      const p = add(c, mul(d, -r));
      const q = add(c, mul(d, r));
      push('dim', segment(p, q));
      arrow(p, mul(d, -1));
      arrow(q, d);
      for (const method of [1, 2]) {
        const pl = textPlacement(p, q, method, undefined, 0);
        value(pl.at, pl.rotationDeg);
      }
      break;
    }

    case 'radius': {
      const c = W(spec.centre);
      const ang = (spec.dirDeg ?? 45) * DEG;
      const d = { x: Math.cos(ang), y: Math.sin(ang) };
      const onArc = add(c, mul(d, toUnits(spec.radiusMm)));
      const outside = spec.fromCentre === false;
      const start = outside
        ? add(c, mul(d, toUnits(spec.radiusMm) + toUnits(spec.leadMm ?? 16)))
        : add(c, mul(d, -toUnits(spec.tailMm ?? 0)));
      push('dim', segment(start, onArc));
      arrow(onArc, outside ? mul(d, -1) : d);
      const onTail = outside || spec.tailMm;
      for (const method of [1, 2]) {
        const pl = textPlacement(start, onArc, method, undefined, 0);
        const at = lerp2(start, onArc, onTail ? -0.12 : 0.55);
        value(onTail ? at : pl.at, method === 2 ? 0 : pl.rotationDeg);
      }
      break;
    }

    case 'radiusLarge': {
      const c = W(spec.centre);
      const ang = (spec.onArcDeg ?? 90) * DEG;
      const d = { x: Math.cos(ang), y: Math.sin(ang) };
      const onArc = add(c, mul(d, toUnits(spec.radiusMm)));
      const jog = add(onArc, mul(d, -toUnits(spec.jogMm ?? 14)));
      const f = W(spec.falseCentre);
      push('dim', segment(onArc, jog));
      push('dim', segment(jog, f));
      arrow(onArc, d);
      const at = lerp2(jog, f, 0.5);
      value({ x: at.x, y: at.y + toUnits(SPACING.textGap + SPACING.textHeight) }, 0);
      break;
    }

    case 'angular':
    case 'arcLength': {
      const v = W(spec.vertex || spec.centre);
      const r = spec.kind === 'arcLength'
        ? toUnits(spec.radiusMm + (spec.offsetMm ?? SPACING.offFirst))
        : toUnits(spec.radiusMm ?? 18);
      const a0 = spec.fromDeg * DEG;
      const a1 = spec.toDeg * DEG;
      if (spec.legs && spec.legs !== 'none') {
        const reach = r + toUnits(SPACING.extOvershoot);
        for (const [which, ang] of [['from', a0], ['to', a1]]) {
          if (spec.legs !== 'both' && spec.legs !== which) continue;
          push('ext', segment(v, { x: v.x + Math.cos(ang) * reach, y: v.y + Math.sin(ang) * reach }));
        }
      }
      const STEPS = 10;
      for (let i = 0; i < STEPS; i++) {
        const b0 = a0 + ((a1 - a0) * i) / STEPS;
        const b1 = a0 + ((a1 - a0) * (i + 1)) / STEPS;
        push('arc', segment(
          { x: v.x + Math.cos(b0) * r, y: v.y + Math.sin(b0) * r },
          { x: v.x + Math.cos(b1) * r, y: v.y + Math.sin(b1) * r }));
      }
      const endA = { x: v.x + Math.cos(a0) * r, y: v.y + Math.sin(a0) * r };
      const endB = { x: v.x + Math.cos(a1) * r, y: v.y + Math.sin(a1) * r };
      const tanA = { x: Math.sin(a0), y: -Math.cos(a0) };
      const tanB = { x: -Math.sin(a1), y: Math.cos(a1) };
      arrow(endA, a1 > a0 ? tanA : mul(tanA, -1));
      arrow(endB, a1 > a0 ? tanB : mul(tanB, -1));
      const aMid = (a0 + a1) / 2;
      const tr = r + toUnits(spec.textGapMm ?? 4);
      const at = { x: v.x + Math.cos(aMid) * tr, y: v.y + Math.sin(aMid) * tr };
      const style = spec.angularStyle || ctx.angularStyle || 'a';
      let rot = 0;
      if (style === 'a') { rot = (aMid / DEG) - 90; while (rot > 90) rot -= 180; while (rot <= -90) rot += 180; }
      value(at, 0);          // Method-2 and Fig. 4.11(b) write it level…
      if (rot) value(at, rot); // …Method-1 Fig. 4.11(a) turns it with the arc.
      break;
    }

    case 'coordinate': {
      const c = W(spec.at);
      const k = toUnits(3);
      push('dim', segment({ x: c.x - k, y: c.y }, { x: c.x + k, y: c.y }));
      push('dim', segment({ x: c.x, y: c.y - k }, { x: c.x, y: c.y + k }));
      const off = toUnits(spec.mode === 'values' ? 3.5 : 5);
      value({ x: c.x + off, y: c.y + off }, 0, spec.mode === 'values' ? 0 : 0.5);
      break;
    }

    // `origin` — the small circle marking the datum of a superimposed running set (Fig. 4.17)
    // — puts nothing on the paper that could be in the way: it is drawn ON the dimension lines
    // it belongs to, which is the whole point of it.
    default: break;   // origin, aid, hatch, break — markers and guide strokes, not annotations
  }
  return out;
}

/**
 * The points on the PART a spec is attached to. Two specs that share one are meeting on purpose
 * (a chain's shared projection line, a running set's common origin) and are never in collision.
 */
function anchorsFor(spec) {
  switch (spec.kind) {
    case 'linear': return [spec.from, spec.to];
    case 'leader': return [spec.anchor];
    case 'diameter': case 'radius': case 'radiusLarge': return [spec.centre];
    case 'angular': return [spec.vertex || spec.centre];
    case 'arcLength': return [spec.centre || spec.vertex];
    case 'origin': case 'coordinate': return [spec.at];
    default: return [];
  }
}

// ============================================================================
// Distance between two convex shapes
// ============================================================================

const box = (pts) => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
};

/** Distance between two segments, 0 when they cross. */
function segDist(a, b, c, d) {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = r.x * s.y - r.y * s.x;
  const qp = sub(c, a);
  if (Math.abs(den) > 1e-12) {
    const t = (qp.x * s.y - qp.y * s.x) / den;
    const u = (qp.x * r.y - qp.y * r.x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const pointSeg = (p, e, f) => {
    const ef = sub(f, e);
    const l2 = ef.x * ef.x + ef.y * ef.y;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - e.x) * ef.x + (p.y - e.y) * ef.y) / l2)) : 0;
    return len(sub(p, lerp2(e, f, t)));
  };
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}

/** Edges of a shape. A 2-point shape is one segment; a polygon is its closed ring. */
function edges(pts) {
  if (pts.length === 2) return [[pts[0], pts[1]]];
  const out = [];
  for (let i = 0; i < pts.length; i++) out.push([pts[i], pts[(i + 1) % pts.length]]);
  return out;
}

/** True when `p` is inside the convex polygon `pts` (used to catch one box swallowing another). */
function inside(p, pts) {
  if (pts.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-12) continue;
    const s = c > 0 ? 1 : -1;
    if (!sign) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/** Distance between two convex shapes; 0 when they touch or overlap. */
function shapeDist(A, B) {
  let best = Infinity;
  for (const [a, b] of edges(A)) {
    for (const [c, d] of edges(B)) {
      const v = segDist(a, b, c, d);
      if (v < best) best = v;
      if (best === 0) return 0;
    }
  }
  if (inside(A[0], B) || inside(B[0], A)) return 0;
  return best;
}

/**
 * Two strokes drawn ALONG THE SAME LINE are one line, not two things colliding. This is what
 * every datum arrangement does: parallel dimensioning runs all its projection lines off the one
 * datum edge on top of each other, and superimposed running dimensioning (Fig. 4.17) draws
 * every dimension line along the single row it is named for.
 */
function collinear(A, B) {
  if (A.length !== 2 || B.length !== 2) return false;
  const u = norm(sub(A[1], A[0]));
  const v = norm(sub(B[1], B[0]));
  if (Math.abs(u.x * v.y - u.y * v.x) > 0.02) return false;      // not parallel
  const n = perp(u);
  const off = (p) => Math.abs((p.x - A[0].x) * n.x + (p.y - A[0].y) * n.y);
  return off(B[0]) < toUnits(0.5) && off(B[1]) < toUnits(0.5);   // and on the same line
}

// ============================================================================
// Which contacts are lawful
// ============================================================================

/**
 * The corridor two specs share: the projection line that springs from a limit they have in
 * common. Everything that happens ON it — a chain's two arrow heads meeting nose to nose
 * (Fig. 4.15), a datum edge carried out past three dimension lines (Fig. 4.16) — is the
 * arrangement doing its job.
 *
 * @returns {Array<{x,y}[]>} the corridor as segments, empty when the two share no limit
 */
function sharedCorridor(specA, specB) {
  const stamp = (a) => `${Math.round(a[0] * 2)},${Math.round(a[1] * 2)}`;
  const aA = anchorsFor(specA).filter(Boolean);
  const aB = anchorsFor(specB).filter(Boolean);
  const out = [];
  for (const a of aA) {
    if (!aB.some((b) => stamp(b) === stamp(a))) continue;
    const at = W(a);
    for (const spec of [specA, specB]) {
      if (spec.kind !== 'linear' || spec.noExtension) continue;
      const { A, B, p, q } = linearEnds(spec);
      for (const [feature, end] of [[A, p], [B, q]]) {
        if (len(sub(feature, at)) > toUnits(0.5)) continue;
        const d = norm(sub(end, feature));
        const total = len(sub(end, feature));
        out.push([feature, add(feature, mul(d, total + toUnits(SPACING.extOvershoot)))]);
      }
    }
  }
  return out;
}

/**
 * WHICH PAIRS OF ROLES ARE HELD APART, and the one pair that is not.
 *
 * The list is the brief the chapter itself sets: a value must touch nothing at all; arrow heads
 * must not meet other arrow heads or land beside them; an angular arc must not run into another
 * dimension; a leader must not run alongside one; two dimension lines must not touch.
 *
 * The exception is a PROJECTION LINE crossing another projection line or a dimension line. That
 * is not a fault, it is how every stacked arrangement in §4.3 works: the outer dimension's
 * projection lines have to get past the inner dimension lines to reach their own, and Fig. 4.16
 * prints exactly that, four rows deep. Holding those apart would forbid parallel dimensioning.
 */
const LOOSE = new Set(['ext|ext', 'ext|dim', 'dim|ext']);
const held = (a, b) => !LOOSE.has(`${a}|${b}`);

/** Two straight dimensions that share a limit AND sit in the same row are one arrangement. */
function sameRow(a, b) {
  if (a.kind !== 'linear' || b.kind !== 'linear') return false;
  if ((a.axis || 'x') !== (b.axis || 'x')) return false;
  if (Math.abs((a.at ?? 0) - (b.at ?? 0)) > 0.01) return false;
  const stamp = (p) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  const aA = anchorsFor(a).filter(Boolean).map(stamp);
  return anchorsFor(b).filter(Boolean).map(stamp).some((s) => aA.includes(s));
}

// ============================================================================
// The knobs — the only things this pass is allowed to turn
// ============================================================================

/** How many steps of each knob a single spec may be given, so the pass always terminates. */
const BUDGET = Object.freeze({ lane: 3, offset: 3, radius: 4, arctext: 3, leaderLen: 3, leaderAim: 2, slide: 3 });

function knobsFor(spec) {
  if (spec.kind === 'linear') {
    // A dimension drawn WITHOUT projection lines has been put where it is on purpose — across
    // the slot on the slot's own centre, up the spigot on the spigot's own axis (Fig. 4.21).
    // Its line is doing the job the projection lines would have done, so its lane is not a free
    // parameter and the pass may only move its value.
    if (spec.noExtension) return ['slide'];
    return spec.axis === 'aligned' ? ['offset', 'slide'] : ['lane', 'slide'];
  }
  // An ANGULAR dimension's radius is free — the arc may be drawn anywhere between the two legs
  // (Fig. 4.11). An ARC-LENGTH dimension's `radiusMm` is the feature's own radius and changing
  // it would change the size being stated, so that one may only move its value.
  if (spec.kind === 'angular') return ['radius', 'arctext'];
  if (spec.kind === 'arcLength') return ['arctext'];
  if (spec.kind === 'leader' || (spec.kind === 'diameter' && spec.mode === 'leader')) return ['leaderLen', 'leaderAim'];
  return [];
}

/** Which field each knob writes — for the move log, and for nothing else. */
const KNOB_FIELD = Object.freeze({
  lane: 'at', offset: 'at', radius: 'radiusMm', leaderAim: 'dirDeg',
  arctext: 'textGapMm', leaderLen: 'lengthMm', slide: 'textAlongMm',
});

/**
 * Turn one knob one step. Returns the CANDIDATE specs it could produce — best guess first, and
 * for the two knobs that have a choice of direction, the other way second, because "away from
 * the thing you are touching" is a good guess and not always the right one. Empty when the knob
 * has nothing left to give.
 *
 * `away` is the world direction this spec should move in to escape what it is touching.
 */
function turn(spec, knob, away) {
  if (knob === 'slide' || knob === 'offset' || knob === 'leaderAim') {
    const both = [step(spec, knob, away), step(spec, knob, mul(away, -1))].filter(Boolean);
    return both.filter((s, i) => both.findIndex((t) => t[KNOB_FIELD[knob]] === s[KNOB_FIELD[knob]]) === i);
  }
  const one = step(spec, knob, away);
  return one ? [one] : [];
}

/** One step of one knob in one direction. */
function step(spec, knob, away) {
  switch (knob) {
    case 'lane': {
      // Out to the next lane. A dimension line may always stand further off the part (§4.3);
      // it may never come closer than the 5–6 mm the chapter asks for, so the sign is fixed by
      // which side of the feature the lane is already on.
      const featureAt = spec.axis === 'y' ? spec.from[0] : spec.from[1];
      const sign = Math.sign((spec.at ?? 0) - featureAt) || 1;
      const next = (spec.at ?? 0) + sign * SPACING.offStep;
      return { ...spec, at: next };
    }
    case 'offset': {
      // A sloping dimension line may stand anywhere from §4.3's 5–6 mm minimum out to a
      // sensible arm's length of its face — and either FURTHER OUT or CLOSER IN will do,
      // whichever of the two opens the gap. It is the one knob where "further away" is not
      // automatically the answer, because a line parallel to a sloping face runs INTO the
      // levels the flat lanes own as it moves out.
      const cur = spec.at ?? SPACING.offFirst;
      const side = Math.sign(cur) || 1;
      const { A, B } = linearEnds(spec);
      const n = perp(norm(sub(B, A)));                 // +at moves along −n
      const outward = away ? Math.sign(-(n.x * away.x + n.y * away.y) * side) || 1 : 1;
      const next = cur + side * outward * 4;
      if (Math.abs(next) < SPACING.offFirst || Math.abs(next) > 30) return null;
      return { ...spec, at: next };
    }
    case 'radius': {
      const cur = spec.radiusMm ?? 18;
      if (cur <= 9) return null;     // below this the arc stops reading as an arc
      return { ...spec, radiusMm: Math.max(9, cur - 3) };
    }
    case 'arctext': {
      const cur = spec.textGapMm ?? 4;
      if (cur >= 16) return null;
      return { ...spec, textGapMm: cur + 3 };
    }
    case 'leaderAim': {
      // §4.1 asks a leader to leave its feature at 30° or steeper and otherwise leaves the
      // angle open, so a note that is running through something may simply be aimed elsewhere.
      // The swing is kept to 20° either side of where the drawing put it: a leader that could
      // wheel right round would stop pointing at what its author meant it to point at.
      const base = spec.aimFromDeg ?? spec.dirDeg ?? 45;
      const cur = spec.dirDeg ?? 45;
      const next = cur + (away ? 10 * (away.y >= 0 ? 1 : -1) : 10);
      if (Math.abs(next - base) > 20) return null;
      const fromFlat = Math.abs(((next % 180) + 180) % 180 - 90);   // 0 = vertical, 90 = flat
      if (fromFlat > 60) return null;                               // shallower than 30°
      return { ...spec, dirDeg: next, aimFromDeg: base };
    }
    case 'leaderLen': {
      // A note is the freest thing on a sheet — §4.1 puts no limit on how far a leader runs, and
      // the step is a whole value-height so one nudge visibly clears the thing it was touching
      // rather than shaving a millimetre off and being rejected for it.
      const cur = spec.lengthMm ?? 22;
      if (cur >= 84) return null;
      return { ...spec, lengthMm: cur + 8 };
    }
    case 'slide': {
      // The value walks along its OWN dimension line. §4.5 wants it at the middle, so this is
      // the last knob tried and the smallest — but a number that has been shifted a few mm
      // along its line still belongs unambiguously to that line, and a number sitting on top
      // of another one belongs to nothing.
      // The step is §4.3's own 6 mm — the same distance a dimension line steps by. A smaller one
      // would leave a value still sitting on the thing it was sitting on, because a value is
      // several millimetres wide and moving it half its own width clears nothing.
      const { p, q } = linearEnds(spec);
      const dir = norm(sub(q, p));
      const cur = spec.textAlongMm ?? 0;
      if (Math.abs(cur) >= 18) return null;
      const sign = away ? (Math.sign(dir.x * away.x + dir.y * away.y) || 1) : 1;
      return { ...spec, textAlongMm: cur + sign * SPACING.offStep };
    }
    default: return null;
  }
}

// ============================================================================
// The pass
// ============================================================================

/** A spec that is meant to be wrong, or that has been nailed down, takes no part. */
function excluded(spec) {
  return !!(spec.pinned || spec.tone === 'bad' || spec.tone === 'good'
    || spec.extShort || spec.extSkew || spec.textNudgeMm || spec.only);
}

const key = (i, j) => `${i}:${j}`;

/** One CONTACT: the two specs and the two roles that are touching. */
const contact = (h) => (h.iA < h.iB
  ? `${h.iA}:${h.iB}:${h.roleA}:${h.roleB}`
  : `${h.iB}:${h.iA}:${h.roleB}:${h.roleA}`);

/**
 * ENFORCE EXTERNAL, LEADER-BASED DIMENSIONING.
 *
 * The house rule for this module is stricter than the chapter: NOTHING may be drawn inside the
 * object boundary, and the object boundary INCLUDES its voids — the circles, the fillets and the
 * slots. Fig. 4.20's across-the-circle diameter and its arrows-outside variant both put a
 * dimension line inside a hole, so neither is used here. Every circular feature is stated on a
 * LEADER: arrow head on the circumference, note out on clear paper.
 *
 * This runs on every draw, so a spec that asks for an internal method cannot reach the paper
 * however it got written. Where the data already routes a sensible leader, that routing is kept;
 * a spec converted here falls back to a 45° lead long enough to clear its own feature.
 *
 * @param {object[]} specs
 * @returns {object[]} the same list with every diameter expressed as a leader
 */
export function externalise(specs) {
  let changed = false;
  const out = specs.map((s) => {
    if (!s || s.kind !== 'diameter' || s.mode === 'leader') return s;
    changed = true;
    return {
      ...s,
      mode: 'leader',
      dirDeg: s.dirDeg ?? 45,
      lengthMm: s.lengthMm ?? Math.max(20, s.diaMm ?? 20),
      barMm: s.barMm ?? 14,
    };
  });
  return changed ? out : specs;
}

/**
 * DOES THIS DRAWING NEED ITS CENTRE LINES SHOWN?
 *
 * A diameter stated on a leader is, on its own, ambiguous: an arrow head touching a circle says
 * nothing about whether the number spans the full width or only the radius. What removes the
 * ambiguity is the feature's own CENTRE LINES — a cross through the circle is what tells the
 * reader the ø is measured right across it. So any drawing that states a diameter on a leader
 * has to show them, and this works that out from the specs rather than leaving it to each step
 * to remember.
 *
 * @param {object[]} specs
 * @returns {boolean}
 */
export function needsCentreLines(specs) {
  return (specs || []).some((s) => s && !s.hidden
    && (s.kind === 'diameter' || (s.kind === 'leader' && /^\s*(ø|Sø|⌀)/.test(String(s.text ?? '')))));
}

/** The drafting options both entry points read, defaulted once. */
function contextFor(opts) {
  return {
    termination: opts.termination || 'open',
    angleDeg: Math.min(90, Math.max(15, opts.terminationAngleDeg ?? TERMINATION.open.includedDeg)),
    angularStyle: opts.angularStyle || 'a',
  };
}

/** The specs that take part: present, visible, not deliberately wrong, and actually inked. */
function liveIndices(specs, ctx) {
  const live = [];
  for (let i = 0; i < specs.length; i++) {
    if (!specs[i] || specs[i].hidden || excluded(specs[i])) continue;
    if (shapesFor(specs[i], ctx).length) live.push(i);
  }
  return live;
}

/** Everything on the paper, indexed by which spec put it there. */
function buildShapes(specs, ctx, live) {
  const all = [];
  for (const i of live) {
    for (const s of shapesFor(specs[i], ctx)) {
      all.push({ i, role: s.role, pts: s.pts, aabb: box(s.pts) });
    }
  }
  return all;
}

/**
 * Every non-exempt contact under `want`, worst first.
 *
 * The three lawful contacts are subtracted here and nowhere else, so the pass and the audit can
 * never disagree about what counts as a collision:
 *   • strokes drawn along the SAME LINE (a datum edge carried out, a superimposed running row);
 *   • two straight dimensions sharing a limit AND sitting in the same row (a chain's arrow
 *     heads meeting nose to nose);
 *   • anything happening ON the projection line two specs share.
 * Two VALUES are exempt from none of it: a number that touches another number is unreadable
 * however lawful the lines under it are.
 */
function tightPairs(specs, ctx, shapes, want) {
  const found = [];
  const cache = new Map();
  const lineCache = new Map();
  const sharesALine = (all, c, i, j) => {
    const k = key(Math.min(i, j), Math.max(i, j));
    if (!lineCache.has(k)) {
      const a = shapesFor(all[i], c).filter((s) => s.pts.length === 2);
      const b = shapesFor(all[j], c).filter((s) => s.pts.length === 2);
      lineCache.set(k, a.some((x) => b.some((y) => collinear(x.pts, y.pts))));
    }
    return lineCache.get(k);
  };
  const corridorFor = (i, j) => {
    const k = `${i}:${j}`;
    if (!cache.has(k)) cache.set(k, sharedCorridor(specs[i], specs[j]));
    return cache.get(k);
  };
  for (let a = 0; a < shapes.length; a++) {
    for (let b = a + 1; b < shapes.length; b++) {
      const A = shapes[a];
      const B = shapes[b];
      if (A.i === B.i) continue;
      if (!held(A.role, B.role)) continue;
      if (A.aabb.x0 - B.aabb.x1 > want || B.aabb.x0 - A.aabb.x1 > want) continue;
      if (A.aabb.y0 - B.aabb.y1 > want || B.aabb.y0 - A.aabb.y1 > want) continue;
      const d = shapeDist(A.pts, B.pts);
      if (d >= want) continue;
      const bothText = A.role === 'text' && B.role === 'text';
      if (!bothText) {
        if (collinear(A.pts, B.pts)) continue;
        if (sameRow(specs[A.i], specs[B.i])) continue;
        // §4.6's own permission, and Step 2's `projline-reuse` rule: an edge or a centre line the
        // part already has may be run out and used as a projection line. Where one spec's line
        // lies ALONG another's, the two are a single stroke and everything on it belongs to both.
        if (sharesALine(specs, ctx, A.i, B.i)) continue;
        const corridor = corridorFor(Math.min(A.i, B.i), Math.max(A.i, B.i));
        if (corridor.length && corridor.some((c) => shapeDist(A.pts, c) <= want && shapeDist(B.pts, c) <= want)) continue;
      }
      found.push({ iA: A.i, iB: B.i, roleA: A.role, roleB: B.role, d, A, B });
    }
  }
  return found.sort((x, y) => x.d - y.d);
}

/**
 * Lay the annotations out.
 *
 * @param {object[]} specs
 * @param {Object} [opts]
 * @param {string} [opts.termination='open']
 * @param {number} [opts.terminationAngleDeg=15]
 * @param {'a'|'b'} [opts.angularStyle='a']
 * @param {number} [opts.clearanceMm=CLEARANCE_MM]
 * @returns {{ specs: object[],
 *             moves: Array<{id:string, knob:string, field:string, from:*, to:*, gapMm:number}>,
 *             unresolved: Array<{a:string, b:string, roles:string, gapMm:number}> }}
 */
export function planLayout(specs, opts = {}) {
  const ctx = contextFor(opts);
  const want = toUnits(opts.clearanceMm ?? CLEARANCE_MM);

  const out = specs.map((s) => s);
  const live = liveIndices(out, ctx);
  const moves = [];
  const unresolved = [];
  if (live.length < 2) return { specs: out, moves, unresolved };

  const spent = new Map();   // `${specIndex}:${knob}` → steps already taken
  const giveUp = new Set();  // pairs nothing can be done about
  const seen = new Set();    // pairs already reported

  /** The gap at ONE contact — these two specs, touching in these two roles — as things stand. */
  const contactGap = (h) => {
    const hits = tightPairs(out, ctx, buildShapes(out, ctx, [h.iA, h.iB]), Infinity)
      .filter((x) => contact(x) === contact(h));
    return hits.length ? hits[0].d : Infinity;
  };

  /**
   * HOW CROWDED THE WHOLE SHEET IS: every millimetre by which every pair falls short of the
   * clearance, added up. A nudge is kept only if this number goes DOWN — otherwise the pass
   * would happily cure one clash by creating another, which is how automatic layout earns its
   * bad name. Because the number strictly decreases on every accepted move, the loop also
   * cannot cycle.
   */
  const crowding = () => {
    const worstPerContact = new Map();
    for (const h of tightPairs(out, ctx, buildShapes(out, ctx, live), want)) {
      const k = contact(h);
      const short = want - h.d;
      if (short > (worstPerContact.get(k) ?? -1)) worstPerContact.set(k, short);
    }
    return [...worstPerContact.values()].sort((a, b) => b - a);
  };

  /** Is crowding `a` an improvement on crowding `b`? Worst clash first, then the next, and so
   *  on — the order a draughtsman would clear a sheet in, and a comparison that cannot cycle. */
  const improves = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? -Infinity;
      const y = b[i] ?? -Infinity;
      if (x < y - toUnits(0.05)) return true;
      if (x > y + toUnits(0.05)) return false;
    }
    return false;
  };

  for (let iter = 0; iter < 24; iter++) {
    const shapes = buildShapes(out, ctx, live);
    // Given up on ONE CONTACT, not on the whole pair. A note whose leader has to cross a
    // projection line to reach clear paper cannot be helped — but the NOTE ITSELF sitting on
    // that same projection line still can be, and it deserves its own turn.
    const worst = tightPairs(out, ctx, shapes, want).find((h) => !giveUp.has(contact(h)));
    if (!worst) break;

    // The lower-priority annotation gives way. If it has nothing left to give, the other one
    // tries — and if neither can move, the pair is reported rather than silently endured.
    const rank = (i) => out[i].priority ?? PRIORITY[out[i].kind] ?? 3;
    const order = rank(worst.iA) >= rank(worst.iB) ? [worst.iA, worst.iB] : [worst.iB, worst.iA];
    const centreOf = (s) => { const b = box(s.pts); return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; };
    const cA = centreOf(worst.A);
    const cB = centreOf(worst.B);
    const gapBefore = contactGap(worst);
    const crowdBefore = crowding();

    let moved = false;
    for (const i of order) {
      const away = norm(sub(i === worst.iA ? cA : cB, i === worst.iA ? cB : cA));
      for (const knob of knobsFor(out[i])) {
        const k = key(i, knob);
        if ((spent.get(k) ?? 0) >= BUDGET[knob]) continue;
        const candidates = turn(out[i], knob, away);
        if (!candidates.length) { spent.set(k, BUDGET[knob]); continue; }
        const before = out[i];
        for (const next of candidates) {
          out[i] = next;
          // A NUDGE THAT DOES NOT OPEN THE GAP IS NOT A NUDGE, and a nudge that opens this gap
          // by closing another one is worse than none. Some knobs simply cannot reach some
          // clashes — a lane that moves further out does nothing about two annotations meeting
          // at the FEATURE end of a projection line. Put it back and try the next candidate.
          const better = contactGap(worst) > gapBefore + toUnits(0.05)
            && improves(crowding(), crowdBefore);
          if (!better) { out[i] = before; continue; }
          spent.set(k, (spent.get(k) ?? 0) + 1);
          const field = KNOB_FIELD[knob];
          const other = out[worst.iA === i ? worst.iB : worst.iA];
          moves.push({
            id: next.id, knob, field,
            from: before[field] ?? null, to: next[field],
            because: `${worst.roleA}/${worst.roleB} vs ${other.id}`,
            gapMm: +toMm(worst.d).toFixed(2),
          });
          moved = true;
          break;
        }
        if (moved) break;
      }
      if (moved) break;
    }
    if (!moved) {
      const pair = contact(worst);
      giveUp.add(pair);
      if (!seen.has(pair)) {
        seen.add(pair);
        unresolved.push({
          a: out[worst.iA].id, b: out[worst.iB].id,
          roles: `${worst.roleA}/${worst.roleB}`, gapMm: +toMm(worst.d).toFixed(2),
        });
      }
    }
  }

  return { specs: out, moves, unresolved };
}

/**
 * Every clearance under `clearanceMm` left on a drawing — the audit the verification harness
 * runs. It is the SAME scan the pass itself uses, so a clean report means a clean drawing and
 * not merely a drawing the pass gave up on.
 *
 * @param {object[]} specs Already laid out.
 * @returns {Array<{a:string, b:string, roles:string, gapMm:number}>}
 */
export function auditClearance(specs, opts = {}) {
  const ctx = contextFor(opts);
  const want = toUnits(opts.clearanceMm ?? CLEARANCE_MM);
  const live = liveIndices(specs, ctx);
  const shapes = buildShapes(specs, ctx, live);
  const seen = new Set();
  const out = [];
  for (const h of tightPairs(specs, ctx, shapes, want)) {
    const k = `${h.iA}:${h.iB}:${h.roleA}:${h.roleB}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      a: specs[h.iA].id, b: specs[h.iB].id,
      roles: `${h.roleA}/${h.roleB}`, gapMm: +toMm(h.d).toFixed(2),
    });
  }
  return out;
}
