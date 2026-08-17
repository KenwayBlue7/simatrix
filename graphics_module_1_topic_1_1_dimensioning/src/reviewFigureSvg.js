// Strokes one of `reviewFigures.js`'s sheets as a flat SVG — Step 6's worked examples.
//
// PURE LEAF: imports one data module and nothing else. No Three.js, no camera, no animation
// and no orbit. These are DRAWINGS, not models: a student comparing a wrong sheet with a
// corrected one is reading a piece of paper, and anything that turns, tweens or shades is
// asking them to look at the wrong thing. That is the lecturers' request, and it is also why
// the topic's other renderer (`dimensionDraw.js`, which paints into a WebGL scene) is not
// reused here — the two answer different questions.
//
// WHAT IT IS NOT. There is no layout pass (ADR-203) behind this file. Every annotation is
// placed by hand in `reviewFigures.js`, because half of these sheets are DELIBERATELY badly
// laid out and a pass whose whole job is to un-crowd a drawing would quietly repair the
// lesson. `verify/reviewfigures.mjs` measures the finished SVG instead — the corrected sheets
// must come out clean, and the faulty ones are exempt by name.
//
// UNITS. Millimetres throughout, y UP, exactly as the data declares them; the only conversion
// is the y flip into SVG's y-down space. One user unit is one millimetre, so a stroke width of
// 0.25 is a 0.25 mm thin line and a value at font-size 3.5 is §4.5 item 3's 3.5 mm lettering.

import { TEXT_MM } from './reviewFigures.js';

const DEG = Math.PI / 180;

/** Line weights, in mm. The chapter's 2:1 thick-to-thin, and the same ratio the 3-D sheets use. */
const W = Object.freeze({ outline: 0.6, thin: 0.22, hidden: 0.3, centre: 0.22 });

/** Arrow head — §4.5 item 2: 3 to 4 mm long, drawn with a thick line. */
const HEAD = Object.freeze({ len: 3.2, halfWidth: 0.55 });

/** Gap between a value and the line it belongs to. One third of a letter height. */
const TEXT_GAP = 1.2;

const n = (v) => (Math.round(v * 1000) / 1000);
const sx = (x) => n(x);
const sy = (y) => n(-y);

/** XML-escape. The strings are ours, but a `<` in a future note must not become markup. */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ primitives */

const line = (a, b, cls) => `<line x1="${sx(a[0])}" y1="${sy(a[1])}" x2="${sx(b[0])}" y2="${sy(b[1])}" class="${cls}"/>`;

/** A filled arrow head with its tip at `at`, pointing along `deg` (y-up degrees). */
function head(at, deg, cls = 'rf-head') {
  const a = deg * DEG;
  const bx = at[0] - Math.cos(a) * HEAD.len;
  const by = at[1] - Math.sin(a) * HEAD.len;
  const px = -Math.sin(a) * HEAD.halfWidth;
  const py = Math.cos(a) * HEAD.halfWidth;
  const p = [[at[0], at[1]], [bx + px, by + py], [bx - px, by - py]]
    .map((q) => `${sx(q[0])},${sy(q[1])}`).join(' ');
  return `<polygon points="${p}" class="${cls}"/>`;
}

/**
 * A value. `rot` is in y-up degrees and is converted to SVG's clockwise-positive rotation.
 * `anchor` is SVG's text-anchor. The glyph body always sits on the far side of the baseline
 * from the line it labels, which is what puts a horizontal value ABOVE its dimension line and
 * a vertical one to the LEFT of it — §4.2's Method 1, the system this course draws in.
 */
function text(at, str, { rot = 0, anchor = 'middle', cls = 'rf-val' } = {}) {
  const t = rot ? ` transform="rotate(${n(-rot)} ${sx(at[0])} ${sy(at[1])})"` : '';
  return `<text x="${sx(at[0])}" y="${sy(at[1])}" text-anchor="${anchor}" class="${cls}"${t}>${esc(str)}</text>`;
}

/** The outline path, in the data's own segment form. All arcs are convex corners. */
function pathOf(segs) {
  const out = [];
  for (const s of segs) {
    if (s[0] === 'M') out.push(`M ${sx(s[1])} ${sy(s[2])}`);
    else if (s[0] === 'L') out.push(`L ${sx(s[1])} ${sy(s[2])}`);
    // ['A', r, largeArc, x, y] — the outline is authored anticlockwise in y-up, so every
    // corner fillet becomes a clockwise sweep once y is flipped: sweep-flag 0.
    else if (s[0] === 'A') out.push(`A ${n(s[1])} ${n(s[1])} 0 ${s[2]} 0 ${sx(s[3])} ${sy(s[4])}`);
    else if (s[0] === 'Z') out.push('Z');
  }
  return out.join(' ');
}

/* ------------------------------------------------------------------ annotations */

/**
 * A linear dimension: two projection lines, one dimension line, an arrow at each end, one
 * value. `outside` moves the arrows out past the projection lines and stretches the dimension
 * line to meet them — §4.1's answer to a span too narrow to take a head at each end.
 */
function drawLinear(a) {
  const out = [];
  const horiz = a.axis === 'x';
  const p = horiz ? [a.from[0], a.at] : [a.at, a.from[1]];
  const q = horiz ? [a.to[0], a.at] : [a.at, a.to[1]];
  const dir = horiz ? Math.sign(q[0] - p[0]) : Math.sign(q[1] - p[1]);

  // Projection lines: from the feature, running 1.5 mm past the dimension line. NO GAP is
  // left at the feature — Fig. 4.1 annotates that junction "No gap is left here".
  if (a.ext !== false) {
    const over = 1.5 * Math.sign(a.at - (horiz ? a.from[1] : a.from[0])) || 1.5;
    for (const f of [a.from, a.to]) {
      const end = horiz ? [f[0], a.at + over] : [a.at + over, f[1]];
      out.push(line(f, end, 'rf-thin'));
    }
  }

  if (a.outside) {
    const run = HEAD.len + 2.5;
    const e1 = horiz ? [p[0] - dir * run, p[1]] : [p[0], p[1] - dir * run];
    const e2 = horiz ? [q[0] + dir * run, q[1]] : [q[0], q[1] + dir * run];
    out.push(line(e1, e2, 'rf-thin'));
    out.push(head(p, horiz ? (dir > 0 ? 180 : 0) : (dir > 0 ? 270 : 90)));
    out.push(head(q, horiz ? (dir > 0 ? 0 : 180) : (dir > 0 ? 90 : 270)));
  } else {
    out.push(line(p, q, 'rf-thin'));
    out.push(head(p, horiz ? (dir > 0 ? 180 : 0) : (dir > 0 ? 270 : 90)));
    out.push(head(q, horiz ? (dir > 0 ? 0 : 180) : (dir > 0 ? 90 : 270)));
  }

  // `textAt` drags the value off its own line. It is a FAULT knob and nothing else — the
  // chapter uses it (Fig. 4.31a writes the 80 on the metal, feet away from the line it
  // belongs to) and a correct sheet must never carry one.
  if (a.textAt) out.push(text(a.textAt, a.text, { anchor: 'middle' }));
  else {
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (horiz) out.push(text([mid[0], mid[1] + TEXT_GAP], a.text));
    else out.push(text([mid[0] - TEXT_GAP, mid[1]], a.text, { rot: 90 }));
  }
  return out.join('');
}

/** A leader: an arrow on the feature, an elbow, a horizontal bar, the note above the bar. */
function drawLeader(a) {
  const out = [];
  const deg = Math.atan2(a.to[1] - a.elbow[1], a.to[0] - a.elbow[0]) / DEG;
  const bar = [a.elbow[0] + a.bar, a.elbow[1]];
  out.push(line(a.elbow, a.to, 'rf-thin'));
  out.push(line(a.elbow, bar, 'rf-thin'));
  out.push(a.dot
    ? `<circle cx="${sx(a.to[0])}" cy="${sy(a.to[1])}" r="0.75" class="rf-head"/>`
    : head(a.to, deg));
  out.push(text([bar[0] - Math.sign(a.bar) * 1, bar[1] + TEXT_GAP], a.text,
    { anchor: a.bar > 0 ? 'end' : 'start' }));
  return out.join('');
}

/**
 * The two-part diameter the chapter draws (Fig. 4.31b, and Fig. 4.20's own construction):
 * a line THROUGH the circle on its centre, inclined, with an arrow at each end landing on the
 * circle — then that same line carried on outside the view as a leader, to a value written on
 * clear paper. A leader alone would not say what it spans; the line through the circle does.
 */
function drawDia(a) {
  const out = [];
  const r = a.d / 2;
  const t = a.deg * DEG;
  const d = [Math.cos(t), Math.sin(t)];
  const near = [a.c[0] - d[0] * r, a.c[1] - d[1] * r];
  const far = [a.c[0] + d[0] * r, a.c[1] + d[1] * r];
  const elbow = [far[0] + d[0] * a.out, far[1] + d[1] * a.out];
  const bar = [elbow[0] + a.bar, elbow[1]];
  out.push(line(near, far, 'rf-thin'));
  out.push(line(far, elbow, 'rf-thin'));
  out.push(line(elbow, bar, 'rf-thin'));
  out.push(head(near, a.deg + 180));
  out.push(head(far, a.deg));
  out.push(text([bar[0] - Math.sign(a.bar) * 1, bar[1] + TEXT_GAP], a.text,
    { anchor: a.bar > 0 ? 'end' : 'start' }));
  return out.join('');
}

/** A radius: ONE arrow, landing on the curve from outside, and a cross on the centre. */
function drawRad(a) {
  const out = [];
  const t = a.deg * DEG;
  const d = [Math.cos(t), Math.sin(t)];
  const onArc = [a.c[0] + d[0] * a.r, a.c[1] + d[1] * a.r];
  const elbow = [a.c[0] + d[0] * (a.r + a.out), a.c[1] + d[1] * (a.r + a.out)];
  const bar = [elbow[0] + a.bar, elbow[1]];
  out.push(line(elbow, onArc, 'rf-thin'));
  out.push(line(elbow, bar, 'rf-thin'));
  out.push(head(onArc, a.deg + 180));
  if (a.mark) {
    out.push(line([a.c[0] - 2, a.c[1]], [a.c[0] + 2, a.c[1]], 'rf-thin'));
    out.push(line([a.c[0], a.c[1] - 2], [a.c[0], a.c[1] + 2], 'rf-thin'));
  }
  out.push(text([bar[0] - Math.sign(a.bar) * 1, bar[1] + TEXT_GAP], a.text,
    { anchor: a.bar > 0 ? 'end' : 'start' }));
  return out.join('');
}

/** An angle: an arc struck about the vertex, an arrow at each end, the value along it. */
function drawAng(a) {
  const out = [];
  const p = (deg) => [a.v[0] + Math.cos(deg * DEG) * a.r, a.v[1] + Math.sin(deg * DEG) * a.r];
  const s = p(a.from); const e = p(a.to);
  const large = Math.abs(a.to - a.from) > 180 ? 1 : 0;
  out.push(`<path d="M ${sx(s[0])} ${sy(s[1])} A ${n(a.r)} ${n(a.r)} 0 ${large} 0 ${sx(e[0])} ${sy(e[1])}" class="rf-thin" fill="none"/>`);
  out.push(head(s, a.from - 90));
  out.push(head(e, a.to + 90));
  const mid = (a.from + a.to) / 2;
  const at = [a.v[0] + Math.cos(mid * DEG) * (a.r + TEXT_GAP + TEXT_MM * 0.4),
    a.v[1] + Math.sin(mid * DEG) * (a.r + TEXT_GAP + TEXT_MM * 0.4)];
  let rot = mid + 90;
  while (rot > 90) rot -= 180;
  while (rot <= -90) rot += 180;
  out.push(text(at, a.text, { rot }));
  return out.join('');
}

const drawFree = (a) => text(a.at, a.text, { rot: a.rot || 0, anchor: 'start', cls: 'rf-val' });
const drawStray = (a) => head(a.at, a.deg) + line(a.at,
  [a.at[0] - Math.cos(a.deg * DEG) * 11, a.at[1] - Math.sin(a.deg * DEG) * 11], 'rf-thin');

/** A leader that points at the wrong thing — the fault sheets' misdirected lines. */
function drawAim(a) {
  const deg = Math.atan2(a.to[1] - a.from[1], a.to[0] - a.from[0]) / DEG;
  return line(a.from, a.to, 'rf-thin') + head(a.to, deg);
}

const DRAW = { lin: drawLinear, lead: drawLeader, dia: drawDia, rad: drawRad, ang: drawAng, free: drawFree, stray: drawStray, aim: drawAim };

/* ------------------------------------------------------------------ the sheet */

/**
 * Build one sheet as an `<svg>` string.
 * @param {object} fig  a member of REVIEW_FIGURES
 * @param {'wrong'|'correct'} which
 * @param {{ title?: string }} [opts]
 * @returns {string}
 */
export function figureSvg(fig, which, opts = {}) {
  const b = fig.box;
  const anns = fig[which] || [];
  const parts = [];

  // Hidden detail first, then the centre lines, then the outline on top of both — the same
  // precedence the 3-D sheet keeps (RULES.md §3.18a): a coincident visible line always wins.
  for (const h of fig.hidden || []) parts.push(line([h[0], h[1]], [h[2], h[3]], 'rf-hidden'));
  for (const c of fig.centres || []) parts.push(line([c[0], c[1]], [c[2], c[3]], 'rf-centre'));
  parts.push(`<path d="${pathOf(fig.outline)}" class="rf-outline" fill="none"/>`);
  for (const c of fig.circles || []) {
    parts.push(`<circle cx="${sx(c.c[0])}" cy="${sy(c.c[1])}" r="${n(c.d / 2)}" class="rf-outline" fill="none"/>`);
  }
  for (const a of anns) {
    const fn = DRAW[a.k];
    if (!fn) continue;
    parts.push(`<g class="rf-ann${a.bad ? ' is-bad' : ''}">${fn(a)}</g>`);
  }

  const label = opts.title || (which === 'wrong' ? 'Wrong dimensioning' : 'Correct dimensioning');
  return `<svg class="rf-svg rf-svg--${which}" viewBox="${n(b.x)} ${n(-(b.y + b.h))} ${n(b.w)} ${n(b.h)}"`
    + ` preserveAspectRatio="xMidYMid meet" role="img"`
    + ` aria-label="${fig.name}: ${label}. ${describe(fig, which)}">`
    + `<g class="rf-sheet">${parts.join('')}</g></svg>`;
}

/**
 * What a screen reader is told about a sheet it cannot see. The drawing is the lesson, so the
 * description has to carry the same information the eye gets: what the part is, and which
 * sizes are on it — not "an engineering drawing".
 */
function describe(fig, which) {
  const vals = (fig[which] || []).filter((a) => a.text).map((a) => a.text);
  return `${fig.arrangement}. ${vals.length} values: ${vals.join(', ')}.`;
}

/**
 * Every value on a sheet, with the box it will occupy in mm — what the clearance check
 * measures. Kept here rather than in the verifier so it can never drift from the renderer:
 * both read the same placement rules from the same file.
 * @returns {Array<{ text:string, bad:boolean, x:number, y:number, w:number, h:number }>}
 */
export function valueBoxes(fig, which) {
  const boxes = [];
  const per = TEXT_MM * 0.62;   // mean advance of the mono face, measured at 3.5 mm
  const put = (at, str, { rot = 0, anchor = 'middle', bad = false } = {}) => {
    const w = String(str).length * per;
    const h = TEXT_MM;
    // The glyph body sits above the baseline, and `rot` turns the whole box about the anchor.
    const left = anchor === 'middle' ? -w / 2 : anchor === 'end' ? -w : 0;
    const corners = [[left, 0], [left + w, 0], [left, h], [left + w, h]].map(([dx, dy]) => {
      const t = rot * DEG;
      return [at[0] + dx * Math.cos(t) - dy * Math.sin(t), at[1] + dx * Math.sin(t) + dy * Math.cos(t)];
    });
    const xs = corners.map((c) => c[0]); const ys = corners.map((c) => c[1]);
    boxes.push({ text: String(str), bad, x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  };

  for (const a of fig[which] || []) {
    const bad = !!a.bad;
    if (a.k === 'lin') {
      const horiz = a.axis === 'x';
      const p = horiz ? [a.from[0], a.at] : [a.at, a.from[1]];
      const q = horiz ? [a.to[0], a.at] : [a.at, a.to[1]];
      if (a.textAt) put(a.textAt, a.text, { bad });
      else {
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        if (horiz) put([mid[0], mid[1] + TEXT_GAP], a.text, { bad });
        else put([mid[0] - TEXT_GAP, mid[1]], a.text, { rot: 90, bad });
      }
    } else if (a.k === 'lead' || a.k === 'dia' || a.k === 'rad') {
      let elbow;
      if (a.k === 'lead') elbow = a.elbow;
      else {
        const t = a.deg * DEG;
        const reach = a.k === 'dia' ? a.d / 2 + a.out : a.r + a.out;
        elbow = [a.c[0] + Math.cos(t) * reach, a.c[1] + Math.sin(t) * reach];
      }
      const bx = elbow[0] + a.bar - Math.sign(a.bar) * 1;
      put([bx, elbow[1] + TEXT_GAP], a.text, { anchor: a.bar > 0 ? 'end' : 'start', bad });
    } else if (a.k === 'ang') {
      const mid = (a.from + a.to) / 2;
      let rot = mid + 90;
      while (rot > 90) rot -= 180;
      while (rot <= -90) rot += 180;
      put([a.v[0] + Math.cos(mid * DEG) * (a.r + TEXT_GAP + TEXT_MM * 0.4),
        a.v[1] + Math.sin(mid * DEG) * (a.r + TEXT_GAP + TEXT_MM * 0.4)], a.text, { rot, bad });
    } else if (a.k === 'free') {
      put(a.at, a.text, { rot: a.rot || 0, anchor: 'start', bad });
    }
  }
  return boxes;
}
