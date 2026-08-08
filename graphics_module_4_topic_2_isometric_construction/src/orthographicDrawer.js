// Orthographic drawer — builds Step 3's engineering drawing sheet as SVG.
//
// WHY SVG, NOT THE WEBGL VIEWPORT. This sheet is a flat, schematic, CLICKABLE teaching diagram
// living in the chrome beside the 3D scene, not measured drafted linework inside the viewport. The
// platform's guidance (RULES.md §3.6b) is to pick by 2D richness — a `Line2`-rich measured sheet
// earns a second scissored WebGL pass, a simple one stays 2D. This is the simple end: a handful of
// outlines that must be focusable, hoverable, keyboard-reachable and screen-reader-labelled, all of
// which are free in the DOM and expensive in GL. Topic 1 already established the SVG "views sheet"
// in this Module-4 family, so this also holds parity with the topic the learner just finished.
//
// FIRST-ANGLE LAYOUT (the Indian standard convention, as in Module 1 and Module 2):
//
//        ┌───────────┐                      the FRONT view sits ABOVE the XY line (on the VP)
//        │   FRONT   │  ┌────────┐          the SIDE view sits beside it, in the same band
//   ─────┴───────────┴──┴────────┴─────  XY   ← the ground line, HP ∩ VP
//        ┌───────────┐                      the TOP view sits BELOW the XY line (on the HP)
//        │    TOP    │
//        └───────────┘
//
// Projection lines tie the views together: verticals carry width down from the front view into the
// top view, horizontals carry height across from the front view into the side view. Those lines are
// the visible proof of the sentence Step 3 is teaching — "these three views completely describe one
// solid" — and the visible source of every dimension Step 4 transfers.
//
// Layering (CLAUDE.md): leaf module. Imports only `shapeData` (for the view primitives it renders)
// and the stateless `tokens` util. It owns its own SVG subtree and nothing else; main.js hands it a
// mount element and listens for view selections.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Sheet gutters, in the same millimetres the views are drawn in.
 *
 * `LEFT_PAD` is wider than the others because the left gutter is a real annotation column: the XY
 * line's `X` end-mark and the two plane tags (VP above the line, HP below it) live there, clear of
 * the drawing. `CAP` reserves the band each view's caption is written in — above the front and side
 * views, below the top view — so a caption never lands on the XY line or on the view beneath it.
 */
const LEFT_PAD = 26;
const MARGIN = 12;
const CAP = 11;
/** Millimetres between the front view and the views projected off it. */
const GAP = 22;
/** How far the XY line and each projection line overrun the drawing, as on a real sheet. */
const OVERRUN = 8;

const VIEW_KEYS = ['front', 'top', 'side'];

const VIEW_TITLES = { front: 'Front View', top: 'Top View', side: 'Side View' };

/** Which reference plane each view is projected onto — the platform's domain encodings. */
const VIEW_PLANE = { front: 'VP', top: 'HP', side: 'PP' };

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Render one view primitive into a group.
 * THE one switch over 2D primitive kinds (`rect` / `circle` / `poly` / `line` / `arc`).
 * `pathLength="1"` on every stroked node lets one CSS rule draw ANY shape on, whatever its real
 * perimeter — no per-shape dash length to keep in sync.
 */
function renderPrimitive(gr, prim, cx, cy) {
  const cls = prim.thin ? 'osheet__edge osheet__edge--thin' : 'osheet__edge';
  switch (prim.k) {
    case 'rect':
      gr.appendChild(el('rect', {
        x: cx - prim.w / 2, y: cy - prim.h / 2, width: prim.w, height: prim.h,
        class: cls, pathLength: 1,
      }));
      break;
    case 'circle':
      gr.appendChild(el('circle', { cx, cy, r: prim.r, class: cls, pathLength: 1 }));
      break;
    case 'poly':
      gr.appendChild(el('polygon', {
        points: prim.pts.map(([x, y]) => `${cx + x},${cy - y}`).join(' '),
        class: cls, pathLength: 1,
      }));
      break;
    case 'line':
      gr.appendChild(el('line', {
        x1: cx + prim.x1, y1: cy - prim.y1, x2: cx + prim.x2, y2: cy - prim.y2,
        class: cls, pathLength: 1,
      }));
      break;
    case 'arc': {
      // A semicircle closed by its diameter — the elevation of a hemisphere.
      const r = prim.r;
      const y0 = cy + (prim.half === 'upper' ? r / 2 : -r / 2);
      // Drawn about the flat face so the view's own centre stays the shape's centroid box.
      const sweep = prim.half === 'upper' ? 1 : 0;
      gr.appendChild(el('path', {
        d: `M ${cx - r} ${y0} A ${r} ${r} 0 0 ${sweep} ${cx + r} ${y0} Z`,
        class: cls, pathLength: 1,
      }));
      break;
    }
    default:
      break;
  }
}

/**
 * Mount the orthographic sheet.
 *
 * @param {HTMLElement} mount  The `<aside>` the SVG lives in.
 * @returns {{
 *   draw: (solid: object, dims: Record<string, number>) => void,
 *   highlight: (key: 'front'|'top'|'side'|null) => void,
 *   viewRect: (key: 'front'|'top'|'side') => {x:number,y:number,width:number,height:number}|null,
 *   viewCenter: (key: 'front'|'top'|'side') => {x:number,y:number}|null,
 *   selected: () => string|null,
 *   onSelect: (cb: (key: string) => void) => void,
 *   setDrawn: (on: boolean) => void,
 *   dispose: () => void,
 * }}
 */
export function initOrthoSheet(mount) {
  let svg = null;
  let selectedKey = null;
  const selectSubs = new Set();
  /** @type {Record<string, SVGGElement|null>} */
  const viewGroups = { front: null, top: null, side: null };

  function clear() {
    if (svg) svg.remove();
    svg = null;
    VIEW_KEYS.forEach((k) => { viewGroups[k] = null; });
  }

  /**
   * Redraw the whole sheet for a solid at a set of dimensions. Called from the single rebuild()
   * pipeline, so the sheet can never disagree with the 3D solid beside it.
   */
  function draw(solid, dims) {
    clear();
    const views = solid.views(dims);

    // ---- Layout, all in millimetres -----------------------------------------------------------
    const frontW = views.front.w; const frontH = views.front.h;
    const topW = views.top.w; const topH = views.top.h;
    const sideW = views.side.w; const sideH = views.side.h;

    const leftBlockW = Math.max(frontW, topW);
    const cxMain = LEFT_PAD + leftBlockW / 2;
    // y of the ground line, in SVG coords (y down). The band above it holds the front and side
    // views plus their captions.
    const xy = MARGIN + CAP + Math.max(frontH, sideH);

    const cxSide = cxMain + leftBlockW / 2 + GAP + sideW / 2;

    const centres = {
      front: [cxMain, xy - frontH / 2],
      side: [cxSide, xy - sideH / 2],
      top: [cxMain, xy + topH / 2],
    };

    const sheetW = cxSide + sideW / 2 + MARGIN;
    const sheetH = xy + topH + CAP + MARGIN;

    svg = el('svg', {
      class: 'osheet__svg',
      viewBox: `0 0 ${sheetW} ${sheetH}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': `Orthographic drawing of the ${solid.name}: front view above the XY line, `
        + 'top view below it, side view beside the front view.',
    });

    // ---- Projection lines (drawn first, so the outlines sit on top) ---------------------------
    const proj = el('g', { class: 'osheet__projectors' });
    // Verticals: width carried from the front view down into the top view.
    for (const x of [cxMain - frontW / 2, cxMain + frontW / 2]) {
      proj.appendChild(el('line', {
        x1: x, y1: xy - frontH - OVERRUN, x2: x, y2: xy + topH + OVERRUN, pathLength: 1,
      }));
    }
    // Horizontals: height carried from the front view across into the side view.
    for (const y of [xy - frontH, xy]) {
      proj.appendChild(el('line', {
        x1: cxMain - frontW / 2 - OVERRUN, y1: y, x2: cxSide + sideW / 2 + OVERRUN, y2: y, pathLength: 1,
      }));
    }
    svg.appendChild(proj);

    // ---- The XY ground line — the datum, HP ∩ VP ---------------------------------------------
    svg.appendChild(el('line', {
      class: 'osheet__xy',
      x1: 4, y1: xy, x2: sheetW - 4, y2: xy, pathLength: 1,
    }));

    // End marks, in the drafting convention: X at the left end of the ground line, Y at the right.
    const xLabel = el('text', { class: 'osheet__xy-label', x: 4, y: xy - 3 });
    xLabel.textContent = 'X';
    const yLabel = el('text', { class: 'osheet__xy-label', x: sheetW - 9, y: xy - 3 });
    yLabel.textContent = 'Y';
    svg.appendChild(xLabel);
    svg.appendChild(yLabel);

    // Plane tags, stacked in the left annotation column. Two cues: the letters AND the side of the
    // XY line each one sits on — VP above (where the front view is), HP below (the top view).
    const vpTag = el('text', { class: 'osheet__plane osheet__plane--vp', x: 3, y: xy - 14 });
    vpTag.textContent = 'VP';
    const hpTag = el('text', { class: 'osheet__plane osheet__plane--hp', x: 3, y: xy + 12 });
    hpTag.textContent = 'HP';
    svg.appendChild(vpTag);
    svg.appendChild(hpTag);

    // ---- The three views ----------------------------------------------------------------------
    for (const key of VIEW_KEYS) {
      const [cx, cy] = centres[key];
      const gr = el('g', {
        class: `osheet__view osheet__view--${key}`,
        'data-view': key,
        tabindex: 0,
        role: 'button',
        'aria-pressed': 'false',
        'aria-label': `${VIEW_TITLES[key]}, projected on the ${VIEW_PLANE[key]}. `
          + 'Select to highlight the matching face on the solid.',
      });

      // A transparent hit plate, so the whole view box is clickable — not just its 1px outline.
      const v = views[key];
      gr.appendChild(el('rect', {
        class: 'osheet__hit',
        x: cx - v.w / 2 - 4, y: cy - v.h / 2 - 4, width: v.w + 8, height: v.h + 8,
      }));

      for (const prim of v.shapes) renderPrimitive(gr, prim, cx, cy);

      // The front and side views sit hard against the XY line, so their captions go ABOVE them;
      // the top view hangs below the line, so its caption goes underneath. Either way the caption
      // lands in the `CAP` band the layout reserved and never on the drawing.
      const caption = el('text', {
        class: 'osheet__caption',
        x: cx,
        y: key === 'top' ? cy + v.h / 2 + 8.5 : cy - v.h / 2 - 3.5,
        'text-anchor': 'middle',
      });
      caption.textContent = VIEW_TITLES[key];
      gr.appendChild(caption);

      const activate = () => {
        for (const cb of selectSubs) cb(key);
      };
      gr.addEventListener('click', activate);
      gr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });

      svg.appendChild(gr);
      viewGroups[key] = gr;
    }

    mount.appendChild(svg);
    // Re-arm the draw-on: strip the class, then restore it next frame so the transition runs.
    mount.classList.remove('is-drawn');
    requestAnimationFrame(() => mount.classList.add('is-drawn'));
    highlight(selectedKey);
  }

  /** Light one view (or none). Two-Cue: an accent frame AND the caption turning bold accent. */
  function highlight(key) {
    selectedKey = key;
    for (const k of VIEW_KEYS) {
      const gr = viewGroups[k];
      if (!gr) continue;
      const on = k === key;
      gr.classList.toggle('is-active', on);
      gr.setAttribute('aria-pressed', String(on));
    }
  }

  function setDrawn(on) { mount.classList.toggle('is-drawn', on); }

  /**
   * Where one view is on SCREEN, in CSS pixels — the anchor Phase B's dimension transfer flies out
   * of. Measured from the live layout rather than recomputed from the mm layout above, because the
   * SVG is `preserveAspectRatio`-fitted into whatever width the sheet ends up with.
   *
   * Guarded against a view that is not laid out (the sheet is hidden outside Steps 3, 4 and 6):
   * a zero-width rect means "no anchor", and the caller falls back rather than flying from 0,0.
   *
   * @param {'front'|'top'|'side'} key
   * @returns {{ x:number, y:number, width:number, height:number } | null}
   */
  function viewRect(key) {
    const gr = viewGroups[key];
    if (!gr) return null;
    const box = gr.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }

  /** Screen-space centre of a view, or `null` when the sheet is not laid out. */
  function viewCenter(key) {
    const r = viewRect(key);
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }

  return {
    draw,
    highlight,
    viewRect,
    viewCenter,
    selected: () => selectedKey,
    onSelect(cb) { selectSubs.add(cb); return () => selectSubs.delete(cb); },
    setDrawn,
    dispose() { clear(); selectSubs.clear(); },
  };
}
