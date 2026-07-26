// Drag-to-pan + scroll-wheel zoom for the construction SVG — the same interaction model
// the platform's 3D Compare canvases use (ADR-054 pan, ADR-055 zoom-to-cursor), re-expressed
// against an SVG `viewBox` instead of a Canvas2D `project()` lens or a Three.js camera: the
// viewBox IS the view-transform, so zoom/pan simply shrink or shift it. A real millimetre
// still reads as the same drawing at 1x — this only changes what window onto it is shown.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls resetView() whenever a
// construction changes (a fresh construction should always open at the default framing).

const BASE_W = 200;
const BASE_H = 140;
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

  viewportEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, listen);

  let dragging = false;
  let lastClient = null;
  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    lastClient = { x: e.clientX, y: e.clientY };
    viewportEl.setPointerCapture(e.pointerId);
  }, listen);
  viewportEl.addEventListener('pointermove', (e) => {
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
  const endDrag = () => { dragging = false; lastClient = null; };
  viewportEl.addEventListener('pointerup', endDrag, listen);
  viewportEl.addEventListener('pointercancel', endDrag, listen);
  viewportEl.addEventListener('dblclick', resetView, listen);

  apply();
  return { resetView, dispose: () => ac.abort() };
}
