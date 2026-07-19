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
import { addLinearDimension } from './dimensions.js';
import { disposeLabels } from './labels.js';
import { createLabelManager } from './labels/LabelManager.js';
import { DIMENSION_OFFSET } from './labels/LabelPlacement.js';

const SHEET = 24;               // bounded reference-sheet size in world units (240 mm)
const UNIT_TO_WORLD = 0.1;      // mm → world units (÷10, ADR-018)
const W = (mm) => mm * UNIT_TO_WORLD;

const LW = { bold: 3.0, view: 2.0, projector: 1.4 };

const GRID = { opacity: 0.55, fade: 0.60, divs: 24 };
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
      dashSize: dashed ? 1.6 : 1,
      gapSize: dashed ? 1.0 : 1,
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

  /** A bounded reference plane: faint translucent fill + a plane-hued perimeter border. */
  function referencePlane(parent, planeColor, fillOpacity, euler) {
    const s = SHEET;
    const geo = new THREE.PlaneGeometry(s, s);
    const mat = new THREE.MeshBasicMaterial({
      color: COL.fill, transparent: true, opacity: fillOpacity,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.setRotationFromEuler(euler);
    mesh.renderOrder = -2;
    parent.add(mesh);

    const half = s / 2;
    const steps = Math.round(s / GRID_CELL);
    const gridPos = [];
    const onPlane = (u, v) => { const p = new THREE.Vector3(u, v, 0).applyEuler(euler); return [p.x, p.y, p.z]; };
    for (let i = 0; i <= steps; i++) {
      const t = -half + i * GRID_CELL;
      gridPos.push(...onPlane(t, -half), ...onPlane(t, half));
      gridPos.push(...onPlane(-half, t), ...onPlane(half, t));
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

    const h = s / 2;
    const local = [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]];
    const flat = [];
    for (const [u, v] of local) {
      const p = new THREE.Vector3(u, v, 0).applyEuler(euler);
      flat.push(p.x, p.y, p.z);
    }
    fatLine(parent, flat, planeColor, 1.4, false).renderOrder = 1;
  }

  // ── HP folds; VP is static. hpGroup carries everything that rides the hinge. ──
  const hpGroup = new THREE.Group();
  group.add(hpGroup);

  referencePlane(group, COL.vp, 0.07, new THREE.Euler());                          // VP wall (static)
  referencePlane(hpGroup, COL.hp, 0.10, new THREE.Euler(-Math.PI / 2, 0, 0));      // HP floor (folds)

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
    // by the Rotation Method). Same builder (addLinearDimension); the top-view dimension is parented
    // to `hpGroup` so it folds glued to the top view.
    const drawTL = (parent, p0, p1) => {
      const va = new THREE.Vector3(...p0), vb = new THREE.Vector3(...p1);
      const d = vb.clone().sub(va);
      if (d.lengthSq() <= 1e-4) return;
      d.normalize();
      const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const off = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(DIMENSION_OFFSET);
      addLinearDimension(parent, va, vb, off,
        { color: COL.ink, resolution: res, materials, widthPx: 1.0, gap: 0.1, overshoot: 0.2, arrowLen: 0.4, flat: false, value: `TL ${Math.round(M.tl)}` });
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
