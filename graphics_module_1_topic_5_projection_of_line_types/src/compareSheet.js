// compareSheet.js — the 2D orthographic drawing leaf.
//
// The Lines 2D Compare drawing renders with the fat-line (Line2) stack in a DEDICATED
// orthographic scene + camera. It draws on its OWN WebGLRenderer/canvas, a genuinely
// separate surface from the 3D scene (own-canvas architecture — supersedes the original
// ADR-034-alternative-A single-canvas scissor design; see DECISIONS.md). This leaf itself
// stays renderer-agnostic: `render(renderer)` just calls `renderer.render(scene, camera)`,
// so main.js can pass whichever renderer owns the sheet's canvas.
//
// The scene also hosts a CONSTRUCTION OVERLAY — a group the orchestrator mounts the Rotation
// Method construction geometry into, so it renders in the SAME scene + camera, pixel-aligned
// to the same views. Construction aids are THIN THREE.Line + circle meshes (not fat lines),
// so they need no resolution sync; they participate in the disposal contract via
// clearConstruction().
//
// Layering (ADR-007 / §3.6): leaf module. It imports only sheet2DLayout.js (the pure-math shared
// exception), never a sibling behaviour leaf. main.js owns the sheet's renderer + canvas.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { HW, HH, layout2D } from './sheet2DLayout.js';
import { addLinearDimension } from './dimensions.js';
import { addLabel, disposeLabels } from './labels.js';
import { PLACEMENT } from './labelPlacement.js';

const MARGIN = 0.6;          // frame margin the ortho camera keeps around the sheet
const LW = { view: 2.0, projector: 1.4, frame: 1.4 };

// Compare pan/zoom (ADR-077): re-expresses Module 2/Points' ADR-054/055 drag-pan + scroll-zoom
// against THIS leaf's live ortho camera (camera.position for pan, camera.zoom for zoom) instead
// of a Canvas2D project() lens — see ADR-077 for why the transform target differs. Same feel:
// clamp and wheel-sensitivity constants match Points' setupComparePan() exactly.
const COMPARE_ZOOM_MIN = 0.4;
const COMPARE_ZOOM_MAX = 5;

// All sheet label standoffs come from the ONE shared placement policy (labelPlacement.js) — no offset
// is invented here. Sheet chips use the §5.9 off-the-linework strategy specialised for axis-aligned
// views: a lateral spread (a left, b right) + a perpendicular lift off the view line (front view up,
// top view down), so no chip crosses the XY line or the projector between the views.
const P2 = PLACEMENT.sheet2D;

const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const cssColor = (name) => new THREE.Color(token(name));

/** @returns {{ scene, camera, setData, setResolution, render, mountConstruction, clearConstruction,
 *   resetView, panByPixels, zoomAtPixel, dispose }} */
export function createCompareSheet({ px = 1, py = 1 } = {}) {
  const scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const camera = new THREE.OrthographicCamera(-(HW + MARGIN), HW + MARGIN, HH + MARGIN, -(HH + MARGIN), -10, 10);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();     // the base sheet (repainted on every commit)
  const overlay = new THREE.Group();   // the mounted construction (Traces / True-Length), or empty
  scene.add(group);
  scene.add(overlay);

  // Annotation hierarchy (DESIGN.md §5.9 / ADR-034 clean-drawing rule): the base view-length
  // DIMENSIONS and a live construction's own callouts (TL / θ / φ / h / HT / v / VT) must NEVER
  // coexist — on the small sheet they overlap into an unreadable tangle. The dims live in their own
  // toggleable sub-group; mounting a construction hides them, clearing it brings them back.
  let dimGroup = null;                  // recreated by every setData (group.clear() drops the old one)
  let constructionActive = false;

  const materials = [];                // base-sheet fat-line materials (resolution-synced)
  const res = new THREE.Vector2(Math.max(1, px), Math.max(1, py));

  const COL = {
    hp: cssColor('--color-hp-line'),
    vp: cssColor('--color-vp-line'),
    ink: cssColor('--color-ink'),
    bench: cssColor('--color-bench-grey'),
  };

  function fatLine(parent, flat, color, widthPx, dashed = false) {
    const geo = new LineGeometry();
    geo.setPositions(flat);
    const mat = new LineMaterial({ color: color.getHex(), linewidth: widthPx, dashed, transparent: true });
    mat.resolution.copy(res);
    const line = new Line2(geo, mat);
    if (dashed) line.computeLineDistances();
    parent.add(line);
    materials.push(mat);
    return line;
  }
  const seg = (parent, a, b, color, widthPx) => fatLine(parent, [a[0], a[1], 0, b[0], b[1], 0], color, widthPx);

  function dot(parent, x, y, color, r = 0.10) { // endpoint marker radius (was 0.16; −37.5% — smaller, still clear)
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false }));
    m.position.set(x, y, 0.01); m.renderOrder = 3; parent.add(m);
  }

  // BIS Type-B dimension of a view LENGTH: the dimension line parallels the view segment, stood
  // off perpendicular on the side AWAY from the XY line (sideSign +1 above / −1 below). Geometry
  // only — the numeric value is the CSS2D-label phase (deferred). A point-view gets no dimension.
  function addViewDim(P, Q, sideSign, value) {
    const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy);
    if (len < 0.15) return;
    let px = -dy / len, py = dx / len;                    // unit perpendicular (rotate +90)
    if ((py >= 0) !== (sideSign > 0)) { px = -px; py = -py; } // stand off on the requested side
    const off = new THREE.Vector3(px, py, 0).multiplyScalar(P2.dimOffset);
    addLinearDimension(dimGroup, new THREE.Vector3(P[0], P[1], 0), new THREE.Vector3(Q[0], Q[1], 0), off,
      { color: COL.ink, resolution: res, materials, widthPx: 1.0, gap: 0.05, overshoot: 0.1, arrowLen: 0.18, flat: true, value });
  }
  const mix = (a, b, t) => a.clone().lerp(b, t); // THREE.Color blend (bold = darkened toward ink)

  /** Dispose the current base-sheet content (a LIVE drawing rebuilt on every commit — ADR-012 §5.14). */
  function clearGroup() {
    disposeLabels(group); // remove CSS2D DOM nodes (§3.5) before dropping the objects
    group.traverse((o) => {
      if (o === group) return;
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m?.dispose());
    });
    group.clear();
    materials.length = 0;
  }

  /** Show/hide the base view-length dimensions. NOTE: setting `dimGroup.visible` alone is NOT enough —
   *  WebGLRenderer honours an ancestor's `.visible` (so the dimension lines/arrows hide), but three's
   *  CSS2DRenderer checks only each CSS2DObject's OWN `.visible`, never its ancestors', so the numeric
   *  value labels ("56"/"49") would keep rendering. Toggle both. */
  function setDimsVisible(v) {
    if (!dimGroup) return;
    dimGroup.visible = v;
    dimGroup.traverse((o) => { if (o.isCSS2DObject) o.visible = v; });
  }

  /** Dispose the mounted construction overlay (participates in the disposal contract, ADR-004). */
  function clearConstruction() {
    disposeLabels(overlay); // remove construction-label DOM nodes (§3.5)
    overlay.traverse((o) => {
      if (o === overlay) return;
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m?.dispose());
    });
    overlay.clear();
  }

  return {
    scene,
    camera,

    setData(resolved, view) {
      clearGroup();
      dimGroup = new THREE.Group(); group.add(dimGroup); // fresh toggleable dimension layer
      // The XY (ground) line only. Pre-ADR-076, this leaf also fat-lined a full sheet-border
      // rectangle here ("always drawn so the sheet reads as a sheet") because the old transparent
      // Compare card had no boundary of its own — the drawn rectangle WAS the only visible edge of
      // the "sheet". ADR-076 gave the card its own opaque-paper, rounded, own-canvas box, so that
      // rectangle became a redundant second edge sitting a few px inside the card's real boundary —
      // rendered pixels, invisible to getComputedStyle, which is why the CSS border removal (Task 1)
      // didn't make the line disappear. Removed rather than kept, to match the card's own frame.
      seg(group, [-HW - 0.3, 0], [HW + 0.3, 0], COL.ink, LW.frame);
      // The XY letters — the sole always-on sheet labels (Points' clean sheet: X/Y only, no
      // plane names or view titles cluttering the drawing). The view is read from a′b′-above /
      // ab-below XY, not from HP/VP captions.
      addLabel(group, 'x', [-HW - 0.05, P2.axisLift, 0], { xy: true });
      addLabel(group, 'y', [HW + 0.05, P2.axisLift, 0], { xy: true });

      if (!(view?.showFV && view?.showTV) || !resolved) return;
      const L = layout2D(resolved);
      // Vertical projectors linking the views through XY (SOLID Type-B, ADR-016 §6.17).
      seg(group, [L.A1[0], L.A1[1]], [L.A2[0], L.A2[1]], COL.bench, LW.projector);
      seg(group, [L.B1[0], L.B1[1]], [L.B2[0], L.B2[1]], COL.bench, LW.projector);
      // Front view a′b′ (VP, amber) above XY; top view ab (HP, teal) below XY — each darkened +
      // bold when it equals the True Length (legacy draw2D asgBold), so it is clear which view
      // carries the true length.
      const fvBold = L.fvTrue, tvBold = L.tvTrue;
      seg(group, L.A1, L.B1, fvBold ? mix(COL.vp, COL.ink, 0.55) : COL.vp, fvBold ? LW.view * 1.4 : LW.view);
      dot(group, L.A1[0], L.A1[1], COL.vp); dot(group, L.B1[0], L.B1[1], COL.vp);
      seg(group, L.A2, L.B2, tvBold ? mix(COL.hp, COL.ink, 0.55) : COL.hp, tvBold ? LW.view * 1.4 : LW.view);
      dot(group, L.A2[0], L.A2[1], COL.hp); dot(group, L.B2[0], L.B2[1], COL.hp);

      // Formal BIS Type-B dimensions of the two view lengths (ADR-041 §6.19), with their values.
      const fvVal = `${Math.round(resolved.fvLen)}${L.fvTrue ? ' = TL' : ''}`;
      const tvVal = `${Math.round(resolved.tvLen)}${L.tvTrue ? ' = TL' : ''}`;
      addViewDim(L.A1, L.B1, 1, fvVal);   // front view (above XY) → dimension stands off above
      addViewDim(L.A2, L.B2, -1, tvVal);  // top view (below XY) → dimension stands off below

      // 2D endpoint letters — a′/b′ on the front view (VP, amber) above XY, a/b on the top view
      // (HP, teal) below XY. Same names as the 3D scene (LabelManager) and the same shared factory
      // (addLabel → the `.lbl--chip` engineering tag), placed by the sheet policy (P2.chip). Added to
      // `group`, so they REBUILD on every setData (step / line-type / θ / φ / TL / fold) and DISPOSE
      // via clearGroup()'s disposeLabels(group) — one lifecycle with the XY marks and dimensions, no
      // second label system. A view that collapses to a point (Steps 2 & 3) gets ONE combined chip
      // nudged out by `pointOut`.
      const chip = (text, x, y, colorTok) => addLabel(group, text, [x, y, 0], { color: colorTok, chip: true });
      const viewChips = (P, Q, la, lb, colorTok, planeSign) => {
        const { out, plane, pointOut } = P2.chip;
        if (Math.hypot(Q[0] - P[0], Q[1] - P[1]) < 0.15) {          // coincident view → single chip
          chip(la + lb, (P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2 + planeSign * pointOut, colorTok);
          return;
        }
        const mx = (P[0] + Q[0]) / 2;                                // spread each letter AWAY from the other
        const sa = P[0] < mx ? -1 : 1;
        const sb = Q[0] < mx ? -1 : 1;
        chip(la, P[0] + sa * out, P[1] + planeSign * plane, colorTok);
        chip(lb, Q[0] + sb * out, Q[1] + planeSign * plane, colorTok);
      };
      viewChips(L.A1, L.B1, "a'", "b'", '--color-vp-line', 1);       // front view a′b′ (above XY)
      viewChips(L.A2, L.B2, 'a', 'b', '--color-hp-line', -1);        // top view ab (below XY)

      setDimsVisible(!constructionActive); // dims yield to a live construction (never coexist)
    },

    setResolution(rw, rh) {
      res.set(Math.max(1, rw), Math.max(1, rh));
      for (const m of materials) m.resolution.copy(res);
      const rectAspect = rw / Math.max(1, rh);
      const sheetAspect = (HW + MARGIN) / (HH + MARGIN);
      let halfW, halfH;
      if (rectAspect >= sheetAspect) { halfH = HH + MARGIN; halfW = halfH * rectAspect; }
      else { halfW = HW + MARGIN; halfH = halfW / rectAspect; }
      camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    },

    /** Mount a construction leaf's group into the overlay (replacing any prior one). The base
     *  view-length dimensions yield to it — the construction owns the sheet's measured callouts
     *  while it runs, so the two annotation layers never overlap (Issue 3 hierarchy). */
    mountConstruction(constructionGroup) {
      clearConstruction();
      constructionActive = true;
      setDimsVisible(false);
      overlay.add(constructionGroup);
    },
    clearConstruction() {
      constructionActive = false;
      setDimsVisible(true);
      clearConstruction();
    },

    render(renderer) { renderer.render(scene, camera); },

    /** Recenter + un-zoom (ADR-055 reset contract). Called on every fresh Compare open and on
     *  a double-click. Camera keeps identity rotation (set once via the initial lookAt above) —
     *  panning/zooming only ever touch position.xy + zoom, never re-orient the camera. */
    resetView() {
      camera.position.set(0, 0, 5);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
    },

    /** Drag-to-pan (ADR-054 parity), re-expressed as a camera move: converts a CSS-px pointer
     *  delta to world units using the camera's own current visible span (right-left)/zoom over
     *  the stage's CSS size, then shifts camera.position so the drawing tracks the cursor 1:1.
     *  No re-lookAt — position is the only thing that changes, so the fat-line geometry stays
     *  pixel-crisp (LineMaterial.resolution is a separate, unaffected concern). */
    panByPixels(dxPx, dyPx, cssW, cssH) {
      const worldPerPxX = (camera.right - camera.left) / camera.zoom / Math.max(1, cssW);
      const worldPerPxY = (camera.top - camera.bottom) / camera.zoom / Math.max(1, cssH);
      camera.position.x -= dxPx * worldPerPxX;
      camera.position.y += dyPx * worldPerPxY;
    },

    /** Scroll-wheel zoom, zeroed-in on the pointer (ADR-055 parity): same
     *  `exp(-deltaY*0.0015)` factor and `[COMPARE_ZOOM_MIN, COMPARE_ZOOM_MAX]` clamp, solved
     *  against the ortho camera instead of a screen-space pan/scale pair — shifts
     *  camera.position by the amount that keeps the world point under (mx,my) stationary as
     *  camera.zoom changes, mirroring ADR-055's `pan' = (cursor-centre)*(1-k) + pan*k`. */
    zoomAtPixel(mx, my, deltaY, cssW, cssH) {
      const factor = Math.exp(-deltaY * 0.0015);
      const nextZoom = Math.min(COMPARE_ZOOM_MAX, Math.max(COMPARE_ZOOM_MIN, camera.zoom * factor));
      if (nextZoom === camera.zoom) return; // clamped — nothing to do
      const worldPerPxX = (camera.right - camera.left) / camera.zoom / Math.max(1, cssW);
      const worldPerPxY = (camera.top - camera.bottom) / camera.zoom / Math.max(1, cssH);
      const k = nextZoom / camera.zoom;
      camera.position.x += (mx - cssW / 2) * worldPerPxX * (1 - 1 / k);
      camera.position.y += (cssH / 2 - my) * worldPerPxY * (1 - 1 / k);
      camera.zoom = nextZoom;
      camera.updateProjectionMatrix();
    },

    dispose() {
      clearGroup();
      clearConstruction();
      scene.background = null;
    },
  };
}
