// Transfer layer — the screen-space bridge that carries a dimension out of an orthographic view and
// onto the isometric axis it is measured along.
//
// WHY THIS EXISTS. Phase B used to make its point by ASSERTION: the box grew, three callouts
// appeared beside it, and a caption said the sizes came from the views. A learner who had not
// already understood that had no reason to believe it. Now the size physically leaves the view it is
// read from and travels to the edge it is set off along — the claim is demonstrated instead of
// stated, which is the difference between a caption and a teaching moment.
//
// WHY SCREEN SPACE. The two ends live in different worlds: the orthographic sheet is DOM/SVG chrome
// and the isometric axes are 3D geometry. There is no single coordinate system that holds both, so
// the bridge is drawn in the one space they can both be projected into — CSS pixels over the
// viewport. main.js supplies both endpoints already projected; this module knows nothing about the
// camera or the sheet.
//
// It is `pointer-events: none` and `aria-hidden`: a drag-to-orbit passes straight through it, and
// `#sim-status` stays the single announcement channel (RULES.md §4.9) rather than a second voice.
//
// Layering (CLAUDE.md): leaf module. Imports only the shared `anim.js` tween engine, whose clock is
// main's render loop — so `simAPI.pause()` freezes a transfer in flight along with everything else,
// which a private rAF would not.

import { tween, easeStandard } from './anim.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Token box, in CSS pixels. Sized for the longest symbol this topic ships (`ØD`). */
const TOKEN_W = 46;
const TOKEN_H = 22;

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Mount the transfer layer.
 *
 * @param {SVGSVGElement} svg  The `#vp-transfer` overlay in the viewport.
 * @param {{ prefersReducedMotion: boolean }} opts
 * @returns {{
 *   resize: (w:number, h:number) => void,
 *   fly: (spec: {
 *     from: {x:number,y:number},
 *     to: {x:number,y:number},
 *     symbol: string,
 *     duration?: number,
 *     onLand?: () => void,
 *   }) => void,
 *   clear: () => void,
 *   inFlight: () => number,
 *   dispose: () => void,
 * }}
 */
export function initTransferLayer(svg, { prefersReducedMotion }) {
  /** Everything currently on the layer, so `clear()` can empty it in one pass. */
  const live = new Set();

  function resize(w, h) {
    svg.setAttribute('viewBox', `0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}`);
    svg.setAttribute('width', String(Math.max(w, 1)));
    svg.setAttribute('height', String(Math.max(h, 1)));
  }

  /**
   * Carry one dimension across. The leader is drawn first and stays for the flight, so the PATH the
   * size travelled is visible after it has landed — the leader is the evidence, the token is only
   * the messenger.
   */
  function fly({ from, to, symbol, duration = 760, onLand }) {
    const g = el('g', { class: 'vp-transfer__run' });

    const leader = el('line', {
      class: 'vp-transfer__leader',
      x1: from.x, y1: from.y, x2: to.x, y2: to.y,
      pathLength: 100,
    });

    const token = el('g', { class: 'vp-transfer__token' });
    token.appendChild(el('rect', {
      class: 'vp-transfer__plate',
      x: -TOKEN_W / 2, y: -TOKEN_H / 2, width: TOKEN_W, height: TOKEN_H, rx: 4,
    }));
    const text = el('text', { class: 'vp-transfer__symbol', 'text-anchor': 'middle', y: 4 });
    text.textContent = symbol;
    token.appendChild(text);

    g.append(leader, token);
    svg.appendChild(g);
    const entry = { g, handle: null };
    live.add(entry);

    const settle = () => {
      // Hand over to the axis callout, then retire quietly — two labels saying the same thing in
      // the same place would read as a duplicate rather than an arrival.
      onLand?.();
      g.classList.add('is-landed');
      const t = setTimeout(() => { g.remove(); live.delete(entry); }, prefersReducedMotion ? 0 : 420);
      entry.timer = t;
    };

    if (prefersReducedMotion) {
      // No motion, but the state still lands: the leader and the callout both appear at once.
      token.setAttribute('transform', `translate(${to.x} ${to.y})`);
      g.classList.add('is-in');
      settle();
      return;
    }

    token.setAttribute('transform', `translate(${from.x} ${from.y})`);
    requestAnimationFrame(() => g.classList.add('is-in'));
    entry.handle = tween({
      from: 0,
      to: 1,
      duration,
      ease: easeStandard,
      onUpdate: (k) => {
        token.setAttribute('transform',
          `translate(${from.x + (to.x - from.x) * k} ${from.y + (to.y - from.y) * k})`);
      },
      onComplete: settle,
    });
  }

  /** Abandon every run — a phase change must not leave a token stranded mid-flight. */
  function clear() {
    for (const entry of live) {
      entry.handle?.cancel();
      clearTimeout(entry.timer);
      entry.g.remove();
    }
    live.clear();
  }

  return {
    resize,
    fly,
    clear,
    inFlight: () => live.size,
    dispose() { clear(); },
  };
}
