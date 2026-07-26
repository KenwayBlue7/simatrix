// lineTypeRig.js — the 3D content leaf for "Types of Lines".
//
// A single geometry leaf (ADR-007 star topology — imports no sibling leaf) that builds the whole
// 3D pictorial scene from a resolved line: the HP/VP reference plane pair + fold line, and the
// true line AB, its front view (a′b′ on VP) and top view (ab on HP), the perpendicular projectors,
// the BIS True-Length dimension, and — new for this topic — a small FOOT DOT at each view's
// endpoints so a projection that collapses to a point still reads as a visible dot (Steps 2 & 3).
//
// It exposes the leaf contract the orchestrator's rebuild()/disposal pipeline drives:
//   { group, setFoldAngle, setResolution, dispose }.
//
// World axes (Module-1 family): HP = XZ plane (y=0) · VP = XY plane (z=0) · fold line = X axis.
// Scale: 1 world unit = 10 mm (ADR-018). The line is centred on its own mid-lateral so it always
// sits in frame.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { addOrientedDimension, orientDimension } from './dimensions.js';
import { disposeLabels } from './labels.js';
import { createLabelManager } from './labels/LabelManager.js';
import { DIMENSION_OFFSET } from './labels/LabelPlacement.js';

// Reference-sheet extent (world units). The prior 24u sizing was wrong: it treated the plane as
// if the drawing could use the FULL ±12u square, but the drawing only ever occupies the first
// quadrant (end A is fixed at aHP=18, aVP=18, and the resolver's dy/dz are ≥0), so half of every
// origin-centred plane was permanently dead — the real usable ceiling was 12u (120 mm). Worse,
// the typed `n-tl` field accepts up to TL=200mm (uiManager.js DRIVERS inputMax, wider than the
// r-tl slider's 150 max, "a wider ceiling for exact textbook values"), and at the ⟂HP/⟂VP steps
// TL drives almost entirely along one axis. Fixed via ADR-079: the planes are now OFFSET (not
// origin-centred) so their full extent sits in the used quadrant, sized to the typed-field worst
// case (aHP/aVP 18 + TL 200 = 218mm = 21.8u) plus a 3u annotation margin, rounded up. GRID.divs
// scales in step so the cell stays a natural engineering grid: 32/32 = 1.0u = 10 mm.
//
// ADR-079 ADDENDUM: that offset fix had a side effect — a plane centred on `[-SHEET/2, +SHEET/2]`
// and then shifted by `PLANE_LIFT` left only `SHEET/2 - PLANE_LIFT` = 6u sitting PAST the fold
// line, down from the pre-ADR-079 12u tail (half of a 24u centred square). On screen the two
// planes read as flush-at-a-hinge instead of visibly crossing through each other. Fixed by making
// the plane a RECTANGLE: width (along the fold line, x) stays exactly SHEET=32 (untouched, so the
// fold line + AXIS_X/Y_ANCHOR + PLANE_HP/VP_ANCHOR need no repositioning); the LIFT-axis extent
// grows to PLANE_REACH + PLANE_OVERHANG, where PLANE_REACH is ADR-079's positive ceiling (kept
// exactly, so the overrun fix is untouched) and PLANE_OVERHANG=12 restores the old 12u tail
// exactly (the pre-ADR-079 centred SHEET/2), landing the far edge back at the same world position
// the reference screenshot shows.
const SHEET = 32;               // plane WIDTH along the XY fold line (x), world units — ADR-079
const PLANE_REACH = 26;         // how far each plane reaches into the used quadrant (ADR-079's
                                 // typed-field worst case + margin). Do not reduce — the overrun fix.
const PLANE_OVERHANG = 12;      // how far each plane continues PAST the fold line so VP/HP visibly
                                 // cross instead of meeting flush at a hinge (see addendum above)
const SHEET_LIFT = PLANE_REACH + PLANE_OVERHANG; // 38 — plane extent along its lift axis
const PLANE_LIFT = SHEET_LIFT / 2 - PLANE_OVERHANG; // 7 — offset centring that span on [-12, +26]
const UNIT_TO_WORLD = 0.1;      // mm → world units (÷10, ADR-018)
const W = (mm) => mm * UNIT_TO_WORLD;

const LW = { bold: 3.0, view: 2.0, projector: 1.4 };

const GRID = { opacity: 0.55, fade: 0.60, divs: 32 };
const GRID_CELL = SHEET / GRID.divs;

const rootStyle = () => getComputedStyle(document.documentElement);
const token = (name) => rootStyle().getPropertyValue(name).trim();
const cssColor = (name) => new THREE.Color(token(name));

/**
 * Build the 3D line scene.
 * @param {object} o
 * @param {{A,B,d,tl,fvLen,tvLen}} o.resolved  a resolveLine() result (mm)
 * @param {{showLine,showFV,showTV}} o.view    the active step's viewport flags
 * @param {number} o.foldAngle                 live hinge angle (rad); 0 = open 3D corner
 * @param {number} o.width                     canvas px width  (LineMaterial.resolution)
 * @param {number} o.height                    canvas px height
 * @returns {{ group, setFoldAngle, setResolution, dispose }}
 */
export function createLineTypeRig({ resolved, view, foldAngle = 0, width = 1, height = 1 }) {
  const group = new THREE.Group();

  const materials = [];
  const res = new THREE.Vector2(Math.max(1, width), Math.max(1, height));

  // Camera-aware BIS dimensions (ADR-081): every addOrientedDimension() entry, paired with the
  // owner group orientDimension() should roll it against. THIS topic's front-view dim is parented
  // to `group` (static); the top-view dim is parented to `hpGroup` (rides the fold) — both owners
  // are tracked per-entry so the roll stays correct through a fold tween. Re-rolled once per frame
  // by orientDimensions() below, called from main.js's render loop.
  const dims = [];

  const COL = {
    hp:     cssColor('--color-hp-line'),
    vp:     cssColor('--color-vp-line'),
    ink:    cssColor('--color-ink'),
    border: cssColor('--color-border'),
    fill:   cssColor('--color-solid-fill'),
    paper:  cssColor('--color-paper'),
  };

  /** Add a fat line segment (or polyline) from a flat [x,y,z, …] array. */
  function fatLine(parent, flat, color, widthPx, dashed = false) {
    const geo = new LineGeometry();
    geo.setPositions(flat);
    const mat = new LineMaterial({
      color: color.getHex(),
      linewidth: widthPx,
      dashed,
      dashSize: dashed ? 0.12 : 1,
      gapSize: dashed ? 0.08 : 1,
      transparent: true,
    });
    mat.resolution.copy(res);
    const line = new Line2(geo, mat);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 2;
    parent.add(line);
    materials.push(mat);
    return line;
  }

  const seg = (parent, a, b, color, widthPx, dashed) =>
    fatLine(parent, [a[0], a[1], a[2], b[0], b[1], b[2]], color, widthPx, dashed);

  /** A small filled sphere marker at a view's endpoint — so a point-view still shows a dot. */
  function footDot(parent, p, color) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true }),
    );
    m.position.set(p[0], p[1], p[2]);
    m.renderOrder = 3;
    parent.add(m);
    return m;
  }

  /** A bounded reference plane: faint translucent fill + a plane-hued perimeter border.
   *  `offset` (world-space THREE.Vector3, default origin) shifts the whole plane past its own
   *  rotation — added AFTER `applyEuler`, the same order Object3D composes (R*local + T), so a
   *  world-axis offset (e.g. "push HP +z") stays a world-axis offset regardless of which local
   *  axis `euler` maps onto it. Used to move each plane's full extent into the quadrant the
   *  drawing actually occupies instead of straddling the origin (ADR-079).
   *  `w`/`h` (local u/v extents, default SHEET/SHEET) let the plane be a RECTANGLE rather than a
   *  square — `h` (the lift axis) is grown past `w` (the fold-line axis) to restore the
   *  cross-through-the-middle overhang without widening the fold line (ADR-079 addendum). */
  function referencePlane(parent, planeColor, fillOpacity, euler, offset = new THREE.Vector3(), w = SHEET, h = SHEET) {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      color: COL.fill, transparent: true, opacity: fillOpacity,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.setRotationFromEuler(euler);
    mesh.position.copy(offset);
    mesh.renderOrder = -2;
    parent.add(mesh);

    const hw = w / 2, hv = h / 2;
    const stepsU = Math.round(w / GRID_CELL);
    const stepsV = Math.round(h / GRID_CELL);
    const gridPos = [];
    const onPlane = (u, v) => { const p = new THREE.Vector3(u, v, 0).applyEuler(euler).add(offset); return [p.x, p.y, p.z]; };
    for (let i = 0; i <= stepsU; i++) {
      const t = -hw + i * GRID_CELL;
      gridPos.push(...onPlane(t, -hv), ...onPlane(t, hv));
    }
    for (let i = 0; i <= stepsV; i++) {
      const t = -hv + i * GRID_CELL;
      gridPos.push(...onPlane(-hw, t), ...onPlane(hw, t));
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPos, 3));
    const gridMat = new THREE.LineBasicMaterial({
      color: planeColor.clone().lerp(COL.paper, GRID.fade),
      transparent: true, opacity: GRID.opacity, depthWrite: false,
    });
    const grid = new THREE.LineSegments(gridGeo, gridMat);
    grid.renderOrder = -1;
    parent.add(grid);

    const local = [[-hw, -hv], [hw, -hv], [hw, hv], [-hw, hv], [-hw, -hv]];
    const flat = [];
    for (const [u, v] of local) {
      const p = new THREE.Vector3(u, v, 0).applyEuler(euler).add(offset);
      flat.push(p.x, p.y, p.z);
    }
    fatLine(parent, flat, planeColor, 1.4, false).renderOrder = 1;
  }

  // ── HP folds; VP is static. hpGroup carries everything that rides the hinge. ──
  const hpGroup = new THREE.Group();
  group.add(hpGroup);

  // rectangular (SHEET × SHEET_LIFT) so each plane overhangs past the fold line — ADR-079 addendum
  referencePlane(group, COL.vp, 0.07, new THREE.Euler(), new THREE.Vector3(0, PLANE_LIFT, 0), SHEET, SHEET_LIFT);                          // VP wall (static)
  referencePlane(hpGroup, COL.hp, 0.10, new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector3(0, 0, PLANE_LIFT), SHEET, SHEET_LIFT);      // HP floor (folds)

  // XY fold line (the true HP ∩ VP intersection) — static
  seg(group, [-SHEET / 2, 0, 0], [SHEET / 2, 0, 0], COL.ink, 1.4, false);

  const labelManager = createLabelManager({ group, hpGroup });
  let linePts = null;

  // ── The line AB + its two views ──
  if (view.showLine && resolved) {
    const M = resolved;
    const cx = (M.A.x + M.B.x) / 2;
    const ax = W(M.A.x - cx), bx = W(M.B.x - cx);
    const A = [ax, W(M.A.y), W(M.A.z)], B = [bx, W(M.B.y), W(M.B.z)];
    const aF = [ax, W(M.A.y), 0], bF = [bx, W(M.B.y), 0];   // front view a′b′ (VP, z=0)
    const aT = [ax, 0, W(M.A.z)], bT = [bx, 0, W(M.B.z)];   // top view ab (HP, y=0) — rides fold

    // Perpendicular projectors (dashed, plane-hued): P→VP amber, P→HP teal
    seg(group,   A, aF, COL.vp, LW.projector, true);
    seg(group,   B, bF, COL.vp, LW.projector, true);
    seg(hpGroup, A, aT, COL.hp, LW.projector, true);
    seg(hpGroup, B, bT, COL.hp, LW.projector, true);

    // Front view a′b′ on VP (amber) — static
    if (view.showFV) seg(group, aF, bF, COL.vp, LW.view, false);
    // Top view ab on HP (teal) — rides the fold
    if (view.showTV) seg(hpGroup, aT, bT, COL.hp, LW.view, false);

    // Foot dots at every view endpoint — so a projection that shrinks to a point (Steps 2 & 3)
    // still reads as one visible dot rather than vanishing.
    if (view.showFV) { footDot(group, aF, COL.vp); footDot(group, bF, COL.vp); }
    if (view.showTV) { footDot(hpGroup, aT, COL.hp); footDot(hpGroup, bT, COL.hp); }

    // The true line AB in space — always the true length, dark + bold
    seg(group, A, B, COL.ink, LW.bold, false);

    // ── True-Length annotation — on the PROJECTION that REVEALS it (ADR-041, BIS Type-B) ──
    // Engineering rule: True Length appears on the plane the line is PARALLEL to — i.e. on the view
    // whose projected length equals the true length. Decided by the SAME criterion the 2D sheet uses
    // (|viewLen − tl| < 0.5, see sheet2DLayout fvTrue/tvTrue): front view when ∥ VP, top view when
    // ∥ HP, BOTH when ∥ both, and NEITHER when inclined to both planes (Step 6 — TL is recovered only
    // by the Rotation Method). Same builder (addOrientedDimension); the top-view dimension is
    // parented to `hpGroup` so it folds glued to the top view AND rolls correctly through the fold
    // tween (orientDimension divides out the owner's world rotation — ADR-081).
    const drawTL = (parent, p0, p1) => {
      const va = new THREE.Vector3(...p0), vb = new THREE.Vector3(...p1);
      const dim = addOrientedDimension(parent, va, vb,
        { color: COL.ink, resolution: res, materials, widthPx: 1.0, gap: 0.1, overshoot: 0.2, arrowLen: 0.4, offsetLen: DIMENSION_OFFSET, value: `TL ${Math.round(M.tl)}` });
      if (dim) dims.push({ entry: dim, owner: parent });
    };
    const isTrueLength = (len) => Math.abs(len - M.tl) < 0.5;
    if (view.showFV && isTrueLength(M.fvLen)) drawTL(group,   aF, bF); // ∥ VP → front view = TL
    if (view.showTV && isTrueLength(M.tvLen)) drawTL(hpGroup, aT, bT); // ∥ HP → top view   = TL

    linePts = { A, B, aF, bF, aT, bT };
  }

  labelManager.build({
    view,
    line: linePts,
    theta: resolved?.theta ?? 0,
    phi: resolved?.phi ?? 0,
  });

  hpGroup.rotation.x = foldAngle;

  return {
    group,
    setFoldAngle(a) { hpGroup.rotation.x = a; },

    /** Re-roll every BIS dimension to face `camera` (ADR-081) — call once per render frame, for
     *  ANY active camera (free-orbit perspective, an engaged ortho quick-view, frameStep's per-step
     *  glide, or the fold swoop). Pure transform, like setFoldAngle above: no rebuild. */
    orientDimensions(camera) {
      for (const { entry, owner } of dims) orientDimension(entry, owner, camera);
    },

    setResolution(w, h) {
      res.set(Math.max(1, w), Math.max(1, h));
      for (const m of materials) m.resolution.copy(res);
    },
    dispose() {
      labelManager.dispose();
      disposeLabels(group);
      group.traverse((o) => {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m?.dispose());
      });
      group.clear();
    },
  };
}

export { SHEET, UNIT_TO_WORLD };
