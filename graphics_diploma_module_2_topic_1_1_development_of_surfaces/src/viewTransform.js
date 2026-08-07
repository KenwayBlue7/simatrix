// Drag-to-pan + scroll-wheel zoom for the construction canvas — REIMPLEMENTED against
// Canvas2D instead of an SVG `viewBox` (ADR-112 §1: this topic's whole plate — front view,
// top-view semicircle, development, transfer lines — is ONE `<canvas>`, not SVG, so
// transfer lines can cross freely between views the way the source textbooks draw them).
//
// Every other Diploma topic's viewTransform.js sets `svg.setAttribute('viewBox', ...)` —
// a canvas has no equivalent built-in "window" concept, so this file instead just OWNS the
// view-state ({vx, vy, vw, vh}, in the same fixed intrinsic user-space units as an SVG
// viewBox would use) and fires an `onChange` callback whenever it moves. The actual
// painting — building a `project(p)` function from the current view-state plus the
// canvas's live CSS size, then repainting — is main.js's job each frame (the same
// ADR-053 "fixed intrinsic frame, project derived per-paint" pattern this platform's other
// Canvas2D sheets already use, e.g. the KTU-track Compare sheet's `drawCompare()`).
//
// EXTERNAL CONTRACT UNCHANGED from the SVG version (ADR-112 §1) — resetView/ensureVisible/
// dispose behave identically; only `getView()` and the `onChange` callback are new, since a
// canvas consumer needs to ask "what's the current window" and "when did it move" instead
// of reading a DOM attribute.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls resetView() whenever a
// construction changes, and ensureVisible() right before Play.

// Single continuous plate (ADR-112): front view + top-view semicircle + development +
// transfer lines all share one intrinsic box. Wide, not tall — the development's stretch-out
// runs well to the right of the two projected views, the same landscape reading as Bhatt
// Fig. 15-8 / K.C. John Fig. 15.4-15.12.
const BASE_W = 420;
const BASE_H = 260;
const MIN_ZOOM = 0.4; // zoom OUT to 2.5x the default view area, to see past wide overshoot/pan
const MAX_ZOOM = 5;

/**
 * @param {HTMLElement} viewportEl  drag/wheel listener target (the canvas itself, or its wrapper)
 * @param {() => void} onChange     called after every view-state change (pan/zoom/reset/fit) —
 *   main.js's hook to schedule a repaint. NOT called for reads (getView()).
 * @param {() => void} [onResetRequest]  double-click hook. Default (omitted) is this file's
 *   own resetView() — the fixed worst-case BASE_W×BASE_H box. main.js passes its own
 *   content-aware resetFit() instead, so double-click reproduces the SAME tight framing
 *   defaultFit() gives a fresh page load (this file stays a leaf, importing nothing — CLAUDE.md
 *   layering — so that routing is a caller-supplied callback, never an import).
 */
export function initViewTransform(viewportEl, onChange, onResetRequest) {
  const ac = new AbortController();
  const listen = { signal: ac.signal, passive: false };

  let vx = 0, vy = 0, vw = BASE_W, vh = BASE_H;

  function apply() {
    onChange?.();
  }

  /** Current view-state, in intrinsic user-space units (the box a project() should map
   *  onto the canvas's live CSS rect, letterboxed to preserve aspect — same semantics as
   *  SVG's `preserveAspectRatio="xMidYMid meet"`, since main.js's project() builder mirrors
   *  that convention rather than stretching to fill). */
  function getView() {
    return { vx, vy, vw, vh, baseW: BASE_W, baseH: BASE_H };
  }

  /** Map a client-space point to the CURRENT view's user-space coordinates. Mirrors the
   *  letterboxed (uniform-scale, centred) fit main.js's project() builder uses, so a
   *  pointer's user-space position agrees with what's actually drawn under it. */
  function toUser(clientX, clientY) {
    const rect = viewportEl.getBoundingClientRect();
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const offX = (rect.width - vw * scale) / 2;
    const offY = (rect.height - vh * scale) / 2;
    const x = vx + (clientX - rect.left - offX) / scale;
    const y = vy + (clientY - rect.top - offY) / scale;
    // relX/relY kept in the SAME letterboxed frame so zoomAt's anchor math stays exact
    // even when the canvas's own aspect ratio doesn't match BASE_W/BASE_H.
    return { x, y, relX: (clientX - rect.left - offX) / (vw * scale), relY: (clientY - rect.top - offY) / (vh * scale) };
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

  /** Keep at least half the drawing area on-screen, however far zoomed/panned. */
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

  /** Unconditionally frame `bounds` ({minX,maxX,minY,maxY} in drawing units, from
   *  renderConstruction.js's computeBounds()) — zooms IN or OUT, unlike ensureVisible's
   *  "only if it doesn't already fit" guard. main.js's default-fit call (construction
   *  selected/reset/problem-loaded) uses this so the initial view frames the actual
   *  content tightly instead of sitting inside the fixed worst-case BASE_W×BASE_H box. */
  function fitToBounds(bounds, margin = 10) {
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

  /** If `bounds` isn't fully inside the CURRENT view, zoom/pan out just enough to bring it
   *  into frame — otherwise leaves the view untouched (a comfortable manual zoom/pan is
   *  left alone). main.js calls this right before Play, and on every slider change as a
   *  clip guard against the tighter default fitToBounds() now sets. Never zooms IN past
   *  the box's own fit, only out. */
  function ensureVisible(bounds, margin = 10) {
    const fits = bounds.minX >= vx && bounds.maxX <= vx + vw && bounds.minY >= vy && bounds.maxY <= vy + vh;
    if (fits) return;
    fitToBounds(bounds, margin);
  }

  viewportEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, listen);

  let dragging = false;
  let lastClient = null;
  // Multi-touch: a Map of pointerId -> last known {x,y}. Every touch contact reports
  // button 0, so without this a second finger landing mid-pinch would be misread by the
  // single-pointer logic as just another drag starting.
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
      // (not an incremental per-frame multiplier), so drift never accumulates.
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
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const dxUser = (e.clientX - lastClient.x) / scale;
    const dyUser = (e.clientY - lastClient.y) / scale;
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
  viewportEl.addEventListener('dblclick', () => (onResetRequest ?? resetView)(), listen);

  return { resetView, ensureVisible, fitToBounds, getView, dispose: () => ac.abort() };
}
