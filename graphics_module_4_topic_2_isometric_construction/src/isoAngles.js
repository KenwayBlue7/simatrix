// Isometric angle annotation — the two 30° arcs that name Phase A's receding axes.
//
// Phase A draws three axes and the copy calls two of them "30° axes". Until this module existed the
// learner had to take that on faith: the number was in the sentence and nowhere on the drawing. Here
// it is measured on screen, in the drafting convention — a horizontal datum through the corner, a
// thin arc swung from that datum onto each receding axis, and the value written against the arc.
//
// WHY SCREEN SPACE. The annotation must stay legible at every zoom and orbit distance, which a 3D
// arc cannot do: it would foreshorten with everything else and shrink out of readability. So the
// arcs live in an SVG overlay sized to the viewport, re-derived every frame from the PROJECTED axis
// directions. Fixed pixel radius, fixed type size, always readable (task brief).
//
// WHY IT IS HONEST. A perspective camera does not preserve angles across the frame — the same three
// axes measure 30° near the principal point and visibly more toward the edges, which is how a "30°"
// label ends up annotating something a learner can measure as 36°. The fix is composition, not
// fudging: main.js aims the camera AT the construction origin during Phase A, so that corner sits on
// the principal axis where the projection is locally angle-preserving and the arcs read a true 30°.
// The module still measures what it draws (`measured()`), so a regression shows up as a number.
//
// AND WHY IT LEAVES. 30° is a property of the ISOMETRIC direction, not of the object. Orbit away and
// the statement stops being true, so the annotation fades out — the fade is part of the teaching.
//
// Layering (CLAUDE.md): leaf module. Owns one SVG subtree and nothing else. It imports NOTHING: main
// hands it already-projected screen points, so it knows nothing of THREE, the camera or the scene.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Arc radius, in CSS pixels. Fixed, so the annotation reads the same at any zoom. */
const ARC_R = 52;
/** How far past the arc the value is written. */
const LABEL_GAP = 17;
/** Half-length of the horizontal datum, as a multiple of the arc radius. */
const DATUM_SPAN = 2.05;

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const len = (x, y) => Math.hypot(x, y) || 1;

/**
 * Mount the angle-annotation layer.
 *
 * @param {SVGSVGElement} svg  The `#vp-angles` overlay in the viewport.
 * @returns {{
 *   resize: (w:number, h:number) => void,
 *   update: (frame: {
 *     origin: {x:number,y:number},
 *     rays: {x:number,y:number}[],
 *     alignment: number,
 *   }) => void,
 *   set: (on:boolean) => void,
 *   visible: () => boolean,
 *   measured: () => number[],
 *   dispose: () => void,
 * }}
 */
export function initIsoAngles(svg) {
  const root = el('g', { class: 'vp-angles__group' });
  const datum = el('line', { class: 'vp-angles__datum' });
  root.appendChild(datum);

  /** One arc + one value, per receding axis. Built once; only their attributes change per frame. */
  const marks = [0, 1].map(() => {
    const g = el('g', { class: 'vp-angles__mark' });
    // `pathLength="100"` lets ONE dash rule draw any arc, whatever its real length — the same trick
    // the orthographic sheet uses for its outlines.
    const arc = el('path', { class: 'vp-angles__arc', pathLength: 100 });
    const value = el('text', { class: 'vp-angles__value', 'text-anchor': 'middle' });
    value.textContent = '30°';
    g.append(arc, value);
    root.appendChild(g);
    return { g, arc, value };
  });

  svg.appendChild(root);

  let shown = false;
  /** Last measured angles, in degrees — what the arcs actually span on screen. */
  let measuredDeg = [];

  function resize(w, h) {
    svg.setAttribute('viewBox', `0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}`);
    svg.setAttribute('width', String(Math.max(w, 1)));
    svg.setAttribute('height', String(Math.max(h, 1)));
  }

  /**
   * Redraw from one frame's projected geometry.
   *
   * @param {{origin:{x:number,y:number}, rays:{x:number,y:number}[], alignment:number}} frame
   *   `rays` are directions (not points) from the origin corner along each RECEDING axis, in screen
   *   pixels with y running down. `alignment` is 1 when the camera is on the isometric sight-line
   *   and falls to 0 as it leaves — the annotation fades out with it.
   */
  function update({ origin, rays, alignment }) {
    if (!shown) return;
    const span = ARC_R * DATUM_SPAN;
    datum.setAttribute('x1', origin.x - span);
    datum.setAttribute('y1', origin.y);
    datum.setAttribute('x2', origin.x + span);
    datum.setAttribute('y2', origin.y);

    measuredDeg = [];
    marks.forEach((mark, i) => {
      const ray = rays[i];
      if (!ray) { mark.g.setAttribute('opacity', '0'); return; }
      const l = len(ray.x, ray.y);
      const ux = ray.x / l; const uy = ray.y / l;

      // Measure against the horizontal on the side the axis recedes toward.
      const side = ux >= 0 ? 1 : -1;
      const dot = Math.max(-1, Math.min(1, ux * side));
      const deg = (Math.acos(dot) * 180) / Math.PI;
      measuredDeg.push(Math.round(deg * 100) / 100);

      const ax = origin.x + side * ARC_R;
      const ay = origin.y;
      const bx = origin.x + ux * ARC_R;
      const by = origin.y + uy * ARC_R;
      // y runs DOWN in screen space, so a positive cross product is a clockwise sweep — which is
      // exactly SVG's sweep-flag 1.
      const cross = side * uy - 0 * ux;
      const sweep = cross > 0 ? 1 : 0;
      mark.arc.setAttribute('d', `M ${ax} ${ay} A ${ARC_R} ${ARC_R} 0 0 ${sweep} ${bx} ${by}`);

      // The value sits on the bisector, just outside the arc, so it never lands on the linework.
      const mxRaw = side + ux; const myRaw = uy;
      const ml = len(mxRaw, myRaw);
      const r = ARC_R + LABEL_GAP;
      mark.value.setAttribute('x', String(origin.x + (mxRaw / ml) * r));
      // +4 keeps the type optically centred on the bisector rather than hanging from its baseline.
      mark.value.setAttribute('y', String(origin.y + (myRaw / ml) * r + 4));
      mark.g.setAttribute('opacity', '1');
    });

    // One property carries the whole fade, so orbiting away retires the annotation smoothly and
    // `prefers-reduced-motion` (which kills the CSS transition) still lands the right end state.
    root.setAttribute('opacity', String(Math.max(0, Math.min(1, alignment))));
  }

  function set(on) {
    shown = on;
    svg.classList.toggle('is-in', on);
    if (!on) {
      root.setAttribute('opacity', '0');
      measuredDeg = [];
    }
  }

  return {
    resize,
    update,
    set,
    visible: () => shown,
    measured: () => [...measuredDeg],
    dispose() { root.remove(); },
  };
}
