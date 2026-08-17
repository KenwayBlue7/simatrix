// Measures Step 6's four worked examples (Figs. 4.28–4.31). No browser: `reviewFigures.js`
// and `reviewFigureSvg.js` are pure leaves, so every sheet can be laid out and measured in
// Node the same way `clearance.mjs` measures the 3-D sheets.
//
//   node verify/reviewfigures.mjs          the CORRECTED sheets, which must come out clean
//   node verify/reviewfigures.mjs --all    the faulty ones too, for information only
//
// TWO THINGS ARE CHECKED, and both are about whether a student can READ the sheet:
//   • no two values overlap
//   • no value sits on the part's own outline
//
// ⚠️ THE `wrong` SHEETS ARE EXEMPT BY DESIGN. Every one of them breaks these rules on purpose
// — that IS the lesson — so they are reported and never counted. If you ever find yourself
// "fixing" a fault sheet to clear this script, you have deleted the thing the sheet teaches.

import { REVIEW_FIGURES } from '../src/reviewFigures.js';
import { valueBoxes } from '../src/reviewFigureSvg.js';

const ALL = process.argv.includes('--all');

/** One letter height of air between two values, exactly as ADR-126 derives it. */
const CLEAR_MM = 2.0;

/** A value may not sit on a stroke of the part itself. */
const OUTLINE_CLEAR_MM = 0.8;

const grow = (b, m) => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** How far two boxes are from clearing each other, in mm. 0 means they already do. */
function shortfall(a, b) {
  const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.max(0, CLEAR_MM - Math.max(gx, gy));
}

/**
 * The outline as a list of straight segments. Arcs are flattened; for the 90° corner fillets
 * these figures use, the centre is whichever of the two axis-aligned candidates lies INSIDE
 * the material — which is what makes the corner convex.
 */
function outlineSegments(fig) {
  const pts = [];
  let cur = null; let start = null;
  const raw = [];
  for (const s of fig.outline) {
    if (s[0] === 'M') { cur = [s[1], s[2]]; start = cur; raw.push(cur); }
    else if (s[0] === 'L') { cur = [s[1], s[2]]; raw.push(cur); }
    else if (s[0] === 'A') { raw.push({ arc: true, r: s[1], to: [s[3], s[4]], from: cur }); cur = [s[3], s[4]]; }
    else if (s[0] === 'Z') raw.push(start);
  }
  // A chord-only polygon, used purely to decide which arc centre is inside the material.
  const chord = raw.map((p) => (p.arc ? p.to : p));
  const inside = (p) => {
    let n = false;
    for (let i = 0, j = chord.length - 1; i < chord.length; j = i++) {
      const a = chord[i]; const b = chord[j];
      if ((a[1] > p[1]) !== (b[1] > p[1])
        && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) n = !n;
    }
    return n;
  };
  for (const p of raw) {
    if (!p.arc) { pts.push(p); continue; }
    const [px, py] = p.from; const [qx, qy] = p.to;
    const cands = [[px, qy], [qx, py]].filter((c) =>
      Math.abs(Math.hypot(px - c[0], py - c[1]) - p.r) < 1e-6
      && Math.abs(Math.hypot(qx - c[0], qy - c[1]) - p.r) < 1e-6);
    const c = cands.find(inside) || cands[0] || [px, qy];
    const a0 = Math.atan2(py - c[1], px - c[0]);
    let a1 = Math.atan2(qy - c[1], qx - c[0]);
    while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    for (let i = 1; i <= 8; i++) {
      const t = a0 + (a1 - a0) * (i / 8);
      pts.push([c[0] + Math.cos(t) * p.r, c[1] + Math.sin(t) * p.r]);
    }
  }
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
  // …and every circle, as a polygon of its own.
  for (const c of fig.circles || []) {
    const r = c.d / 2; const ring = [];
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      ring.push([c.c[0] + Math.cos(t) * r, c.c[1] + Math.sin(t) * r]);
    }
    for (let i = 0; i + 1 < ring.length; i++) segs.push([ring[i], ring[i + 1]]);
  }
  return segs;
}

/** Does a segment pass through a box? Sampled — the boxes are large next to the step. */
function segInBox(seg, box) {
  const [a, b] = seg;
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, w: 0, h: 0 };
    if (hit(p, box)) return true;
  }
  return false;
}

let failures = 0;
let checked = 0;

for (const fig of REVIEW_FIGURES) {
  const segs = outlineSegments(fig);
  for (const which of ['correct', 'wrong']) {
    const authoritative = which === 'correct';
    if (!authoritative && !ALL) continue;
    const boxes = valueBoxes(fig, which);
    const notes = [];

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const s = shortfall(boxes[i], boxes[j]);
        if (s > 0.001) notes.push(`  VALUE  "${boxes[i].text}" × "${boxes[j].text}" — ${s.toFixed(2)} mm short of ${CLEAR_MM}`);
      }
    }
    for (const b of boxes) {
      const g = grow(b, OUTLINE_CLEAR_MM);
      if (segs.some((s) => segInBox(s, g))) notes.push(`  ON LINE "${b.text}" @ ${b.x.toFixed(0)},${b.y.toFixed(0)} sits on the part's outline`);
    }

    checked++;
    const tag = `Fig. ${fig.no} ${fig.name} · ${which}`;
    if (!notes.length) {
      console.log(`OK    ${tag} — ${boxes.length} values, all clear`);
    } else if (authoritative) {
      failures += notes.length;
      console.log(`FAIL  ${tag} — ${notes.length} problem(s)`);
      for (const n of notes) console.log(n);
    } else {
      console.log(`(bad) ${tag} — ${notes.length} deliberate fault(s), not counted`);
      for (const n of notes) console.log(n);
    }
  }
}

console.log(`\n${checked} sheet(s) measured · ${failures} problem(s) on the corrected sheets — ${failures ? 'FAIL' : 'PASS'}`);
process.exit(failures ? 1 : 0);
