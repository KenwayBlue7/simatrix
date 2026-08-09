// Drag-to-pan + scroll-wheel zoom for the construction SVG — the same interaction model
// the platform's 3D Compare canvases use (ADR-054 pan, ADR-055 zoom-to-cursor), re-expressed
// against an SVG `viewBox` instead of a Canvas2D `project()` lens or a Three.js camera: the
// viewBox IS the view-transform, so zoom/pan simply shrink or shift it. A real millimetre
// still reads as the same drawing at 1x — this only changes what window onto it is shown.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls resetView() whenever a
// construction changes (a fresh construction should always open at the default framing),
// and ensureVisible() right before Play (so a zoomed-in/panned view can't miss geometry the
// animation is about to draw outside it).

const BASE_W = 200;
const BASE_H = 200;
const MIN_ZOOM = 0.4; // zoom OUT to 2.5x the default view area, to see past wide overshoot/pan
const MAX_ZOOM = 5;

/** @param {SVGSVGElement} svg  @param {HTMLElement} viewportEl  drag/wheel listener target */
export function initViewTransform(svg, viewportEl) {
  const ac = new AbortController();
  const listen = { signal: ac.signal, passive: false };

  let vx = 0, vy = 0, vw = BASE_W, vh = BASE_H;

  function apply() {
    svg.setAttribute('viewBox', `${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
  }

  /** Map a client-space point to the CURRENT viewBox's user-space coordinates. */
  function toUser(clientX, clientY) {
    const rect = viewportEl.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    return { x: vx + relX * vw, y: vy + relY * vh, relX, relY };
  }

  function zoomAt(clientX, clientY, factor) {
    const zoomNow = BASE_W / vw;
    const zoomNext = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomNow * factor));
    if (zoomNext === zoomNow) return;
    const { x: userX, y: userY, relX, relY } = toUser(clientX, clientY);
    const newW = BASE_W / zoomNext;
    const newH = BASE_H / zoomNext;
    vx = userX - relX * newW;
    vy = userY - relY * newH;
    vw = newW;
    vh = newH;
    clampPan();
    apply();
  }

  /** Keep at least half the drawing area on-screen, however far zoomed/panned. Zoomed OUT
   *  past the drawing's own size (vw/vh bigger than the base area plus margin) has nothing
   *  left to clamp against, so center the view instead of locking it to a stale edge. */
  function clampPan() {
    const marginX = BASE_W * 0.15;
    const marginY = BASE_H * 0.15;
    if (vw >= BASE_W + marginX * 2) vx = (BASE_W - vw) / 2;
    else vx = Math.min(Math.max(vx, -marginX), BASE_W - vw + marginX);
    if (vh >= BASE_H + marginY * 2) vy = (BASE_H - vh) / 2;
    else vy = Math.min(Math.max(vy, -marginY), BASE_H - vh + marginY);
  }

  function resetView() {
    vx = 0; vy = 0; vw = BASE_W; vh = BASE_H;
    apply();
  }

  /** If `bounds` (a {minX,maxX,minY,maxY} box in drawing units, from renderConstruction.js's
   *  computeBounds()) isn't fully inside the CURRENT view, zoom/pan out just enough to bring
   *  it into frame — otherwise leaves the view untouched. main.js calls this right before
   *  Play, so a construction the student zoomed/panned away from doesn't animate partly (or
   *  fully) out of sight. Never zooms IN past the box's own fit, only out. */
  function ensureVisible(bounds, margin = 10) {
    // The "already visible" check uses the RAW bounds, not margin-padded — otherwise a
    // construction whose bounds exactly match the default view would still "not fit" (the
    // margin pushes past it) and re-fit on every single Play, even at 1x/no pan. Margin
    // only widens the frame once a re-fit is actually needed, for a comfortable border.
    const fits = bounds.minX >= vx && bounds.maxX <= vx + vw && bounds.minY >= vy && bounds.maxY <= vy + vh;
    if (fits) return;
    const bx0 = bounds.minX - margin, bx1 = bounds.maxX + margin;
    const by0 = bounds.minY - margin, by1 = bounds.maxY + margin;
    const bw = Math.max(bx1 - bx0, 1e-6);
    const bh = Math.max(by1 - by0, 1e-6);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(BASE_W / bw, BASE_H / bh)));
    vw = BASE_W / zoom;
    vh = BASE_H / zoom;
    vx = (bx0 + bx1) / 2 - vw / 2;
    vy = (by0 + by1) / 2 - vh / 2;
    clampPan();
    apply();
  }

  viewportEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, listen);

  let dragging = false;
  let lastClient = null;
  // Multi-touch: a Map of pointerId -> last known {x,y}. Every touch contact reports
  // button 0 (touch has no "right click"), so without this a second finger landing
  // mid-pinch would be misread by the single-pointer logic above as just another drag
  // starting, producing an erratic jump instead of a pinch-zoom — the actual bug behind
  // "zoom/pan doesn't work right on touch screens."
  const activePointers = new Map();
  let pinchStartDist = null;
  let pinchStartZoom = null;
  const currentZoom = () => BASE_W / vw;

  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewportEl.setPointerCapture(e.pointerId);
    if (activePointers.size === 1) {
      dragging = true;
      lastClient = { x: e.clientX, y: e.clientY };
    } else if (activePointers.size === 2) {
      dragging = false; // a second touch means pinch-zoom, not pan
      const [a, b] = [...activePointers.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartZoom = currentZoom();
    }
  }, listen);
  viewportEl.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      // Recompute the target zoom from the CURRENT two-finger distance ratio each frame
      // (not an incremental per-frame multiplier), so drift never accumulates across a
      // long pinch gesture.
      const [a, b] = [...activePointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStartDist && dist > 0) {
        const targetZoom = pinchStartZoom * (dist / pinchStartDist);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        zoomAt(mid.x, mid.y, targetZoom / currentZoom());
      }
      return;
    }
    if (!dragging || !lastClient) return;
    const rect = viewportEl.getBoundingClientRect();
    const dxUser = ((e.clientX - lastClient.x) / rect.width) * vw;
    const dyUser = ((e.clientY - lastClient.y) / rect.height) * vh;
    vx -= dxUser;
    vy -= dyUser;
    lastClient = { x: e.clientX, y: e.clientY };
    clampPan();
    apply();
  }, listen);
  const endDrag = (e) => {
    if (e) activePointers.delete(e.pointerId);
    if (activePointers.size < 2) { pinchStartDist = null; pinchStartZoom = null; }
    if (activePointers.size === 1) {
      // One finger still down after a pinch ends — resume single-finger pan from its
      // current position, not a stale one, so it doesn't jump.
      const [remaining] = activePointers.values();
      dragging = true;
      lastClient = { ...remaining };
    } else {
      dragging = false;
      lastClient = null;
    }
  };
  viewportEl.addEventListener('pointerup', endDrag, listen);
  viewportEl.addEventListener('pointercancel', endDrag, listen);
  viewportEl.addEventListener('dblclick', resetView, listen);

  // Keyboard equivalents of drag-to-pan/scroll-to-zoom/double-click-reset (RULES §4.12 — an
  // interactive target needs a keyboard path, not just pointer/touch). Phase A audit found
  // the drawing reachable ONLY by mouse; `viewportEl` (svgEl, tabindex="0" in index.html) is
  // the sole keydown target. Arrow keys pan proportionally to the CURRENT zoom (a fraction of
  // vw/vh, matching drag's own feel — the same client-pixel movement pans less once zoomed
  // in); +/-/0 reuse zoomAt()/resetView() exactly as the wheel and dblclick handlers do,
  // anchored on the viewport's own centre (there's no cursor position to anchor to from a
  // keypress).
  viewportEl.addEventListener('keydown', (e) => {
    const PAN_FRACTION = 0.08;
    switch (e.key) {
      case 'ArrowLeft': vx -= vw * PAN_FRACTION; clampPan(); apply(); break;
      case 'ArrowRight': vx += vw * PAN_FRACTION; clampPan(); apply(); break;
      case 'ArrowUp': vy -= vh * PAN_FRACTION; clampPan(); apply(); break;
      case 'ArrowDown': vy += vh * PAN_FRACTION; clampPan(); apply(); break;
      case '+': case '=': {
        const rect = viewportEl.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
        break;
      }
      case '-': case '_': {
        const rect = viewportEl.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2);
        break;
      }
      case '0': resetView(); break;
      default: return; // let every other key (Tab, Space on a focused ancestor, …) through
    }
    e.preventDefault();
  }, listen);

  apply();
  return { resetView, ensureVisible, dispose: () => ac.abort() };
}
