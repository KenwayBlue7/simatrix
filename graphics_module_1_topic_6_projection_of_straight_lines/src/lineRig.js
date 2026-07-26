// lineRig.js — the 3D content leaf for Projection of Straight Lines (Phase 4A boot).
//
// A single geometry leaf (ADR-007 star topology — imports no sibling leaf) that
// builds the whole 3D pictorial scene from a resolved line: the HP/VP reference
// plane pair + fold line, and — when the view flags allow — the true line AB, its
// front view (a′b′ on VP) and top view (ab on HP), and the perpendicular projectors.
//
// Phase 4A is an ARCHITECTURE migration: this leaf is deliberately minimal (fat-line
// geometry only, no CSS2D labels / dimensions / angle marks yet — those return in a
// later phase). It exposes the leaf contract the orchestrator's rebuild()/disposal
// pipeline drives: { group, setFoldAngle, setResolution, dispose }.
//
// World axes (Module-1 family convention): HP = XZ plane (y=0) · VP = XY plane (z=0)
// · fold line = X axis. Scale: 1 world unit = 10 mm (ADR-018). The line is centred on
// its own mid-lateral so it always sits in frame.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { addOrientedDimension, orientDimension } from './dimensions.js';
import { addLabel, disposeLabels } from './labels.js';             // addLabel: shared CSS2D factory (the per-view TL tag); disposeLabels: generic CSS2D DOM sweep (the TL dimension's value label, owned by dimensions.js)
import { createLabelManager } from './labels/LabelManager.js';     // the 3D label system (STEP 3)
import { DIMENSION_OFFSET } from './labels/LabelPlacement.js';     // the ONE source for the TL dimension standoff

// Reference-sheet extent (world units). The prior 24u sizing (ADR predating this comment) was
// wrong: it treated the plane as if the drawing could use the FULL ±12u square, but the drawing
// only ever occupies the first quadrant (end A's aHP/aVP are ≥0, and the resolver's dy/dz are
// ≥0), so half of every origin-centred plane was permanently dead — the real usable ceiling was
// 12u (120 mm), not 24u. Worse, the sliders (`r-tl` max 150, `r-ahp`/`r-avp` max 100) are not the
// true ceiling: the typed numeric fields accept up to TL=200mm, aHP/aVP=150mm each (uiManager.js
// DRIVERS inputMax, "a wider ceiling for exact textbook values"). Fixed via ADR-079: the planes
// are now OFFSET (not origin-centred) so their full extent sits in the used quadrant, sized to
// the typed-field worst case (aHP/aVP 150 + TL 200 = 350mm = 35u) plus a 3u annotation margin
// (endpoint chips, the TL dimension standoff, the TL tag lift), rounded up. GRID.divs scales in
// step so the cell stays a natural engineering grid: 44/44 = 1.0u = 10 mm.
//
// ADR-079 ADDENDUM: that offset fix had a side effect — a plane centred on `[-SHEET/2, +SHEET/2]`
// and then shifted by `PLANE_LIFT` left only `SHEET/2 - PLANE_LIFT` = 6u sitting PAST the fold
// line, down from the pre-ADR-079 12u tail (half of a 24u centred square). On screen the two
// planes read as flush-at-a-hinge instead of visibly crossing through each other. Fixed by making
// the plane a RECTANGLE: width (along the fold line, x) stays exactly SHEET=44 (untouched, so the
// fold line + AXIS_X/Y_ANCHOR + PLANE_HP/VP_ANCHOR need no repositioning); the LIFT-axis extent
// grows to PLANE_REACH + PLANE_OVERHANG, where PLANE_REACH is ADR-079's positive ceiling (kept
// exactly, so the overrun fix is untouched) and PLANE_OVERHANG=12 restores the old 12u tail
// exactly (the pre-ADR-079 centred SHEET/2), landing the far edge back at the same world position
// the reference screenshot shows.
const SHEET = 44;               // plane WIDTH along the XY fold line (x), world units — ADR-079
const PLANE_REACH = 38;         // how far each plane reaches into the used quadrant (ADR-079's
                                 // typed-field worst case + margin). Do not reduce — the overrun fix.
const PLANE_OVERHANG = 12;      // how far each plane continues PAST the fold line so VP/HP visibly
                                 // cross instead of meeting flush at a hinge (see addendum above)
const SHEET_LIFT = PLANE_REACH + PLANE_OVERHANG; // 50 — plane extent along its lift axis
const PLANE_LIFT = SHEET_LIFT / 2 - PLANE_OVERHANG; // 13 — offset centring that span on [-12, +38]
const UNIT_TO_WORLD = 0.1;      // mm → world units (÷10, ADR-018)
const W = (mm) => mm * UNIT_TO_WORLD;

// Line weights in CSS px (mirrors the legacy engine's LW constants, trimmed to what
// this boot leaf draws). Fat lines keep a real, constant pixel weight (ADR-006 §3.12).
const LW = { bold: 3.0, view: 2.0, projector: 1.4 };

// The 3D CSS2D labels are owned by the label system in src/labels/ (LabelManager + LabelFactory +
// LabelStyles + LabelPlacement). This leaf builds only geometry, then hands the label manager the
// endpoint coordinates; the manager creates, positions, and parents every label. No label offset,
// class, or position math lives in this file.

// The "cage" reference grid — the platform drafting grid, reproduced EXACTLY from the Points
// reference (graphics_module_1_topic_3_points/src/hvPlanes.js): thin native LineSegments, the
// plane hue faded `fade` toward paper, at `divs` divisions across the sheet, under every stroke
// (renderOrder −1). This is the drafting/grid background DESIGN.md's "reference grids" call for.
const GRID = { opacity: 0.55, fade: 0.60, divs: 44 };
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
export function createLineRig({ resolved, view, foldAngle = 0, width = 1, height = 1 }) {
  const group = new THREE.Group();

  // Every fat-line material is tracked so setResolution() can keep them in sync with
  // the canvas pixel size on resize (ADR-006 §3.16) and dispose() can free them all.
  const materials = [];
  const res = new THREE.Vector2(Math.max(1, width), Math.max(1, height));

  // Camera-aware BIS dimensions (ADR-081): every addOrientedDimension() entry, paired with the
  // owner group orientDimension() should roll it against (the TL dimension's parent — always
  // `group` here, since this topic's rig never parents a dimension to the folding `hpGroup`).
  // Re-rolled once per frame by orientDimensions() below, called from main.js's render loop.
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
    if (dashed) line.computeLineDistances();   // else dashes render solid (ADR-006 §3.17)
    line.renderOrder = 2;
    parent.add(line);
    materials.push(mat);
    return line;
  }

  const seg = (parent, a, b, color, widthPx, dashed) =>
    fatLine(parent, [a[0], a[1], a[2], b[0], b[1], b[2]], color, widthPx, dashed);

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
    mesh.renderOrder = -2; // under the grid (−1) and all strokes (matches Points hvPlanes)
    parent.add(mesh);

    // The cage reference grid (platform drafting grid — Points hvPlanes.js `calmGrid`): thin
    // native lines, plane hue faded toward paper, placed on the plane in its local frame then
    // rotated by `euler`, drawn under the strokes.
    const hw = w / 2, hv = h / 2;
    const stepsU = Math.round(w / GRID_CELL);
    const stepsV = Math.round(h / GRID_CELL);
    const gridPos = [];
    const onPlane = (u, v) => { const p = new THREE.Vector3(u, v, 0).applyEuler(euler).add(offset); return [p.x, p.y, p.z]; };
    for (let i = 0; i <= stepsU; i++) {
      const t = -hw + i * GRID_CELL;
      gridPos.push(...onPlane(t, -hv), ...onPlane(t, hv));       // lines across v (fixed u = t)
    }
    for (let i = 0; i <= stepsV; i++) {
      const t = -hv + i * GRID_CELL;
      gridPos.push(...onPlane(-hw, t), ...onPlane(hw, t));       // lines across u (fixed v = t)
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPos, 3));
    const gridMat = new THREE.LineBasicMaterial({
      color: planeColor.clone().lerp(COL.paper, GRID.fade),
      transparent: true, opacity: GRID.opacity, depthWrite: false,
    });
    const grid = new THREE.LineSegments(gridGeo, gridMat);
    grid.renderOrder = -1; // above the fill (−2), under every stroke (0+)
    parent.add(grid);

    // perimeter border (fat line, plane-hued) in the plane's local frame → world
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

  // VP wall (XY plane, z=0) — static; offset +y so its full extent covers the used quadrant,
  // rectangular (SHEET × SHEET_LIFT) so it overhangs past the fold line — see ADR-079 addendum
  referencePlane(group, COL.vp, 0.07, new THREE.Euler(), new THREE.Vector3(0, PLANE_LIFT, 0), SHEET, SHEET_LIFT);
  // HP floor (XZ plane, y=0) — rides the fold; offset +z, same reasoning
  referencePlane(hpGroup, COL.hp, 0.10, new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector3(0, 0, PLANE_LIFT), SHEET, SHEET_LIFT);

  // XY fold line (the true HP ∩ VP intersection) — static
  seg(group, [-SHEET / 2, 0, 0], [SHEET / 2, 0, 0], COL.ink, 1.4, false);

  // The 3D label system. Owners handed in: `group` (static rig root) + `hpGroup` (the fold floor).
  // Geometry is built below; the endpoint coordinates are collected into `linePts` and the manager
  // builds every label AFTER the geometry (one call, one owner per label — STEP 8).
  const labelManager = createLabelManager({ group, hpGroup });
  let linePts = null;

  // ── The line AB + its two views (gated by the step's view flags) ──
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

    // A projection reads its TRUE LENGTH only when the line is PARALLEL to that plane, i.e. the
    // view length equals the space TL: front view = TL ⇔ line ∥ VP (or ⟂ HP); top view = TL ⇔
    // line ∥ HP (or ⟂ VP); both when ∥ both; NEITHER when inclined to both (a foreshortened view
    // never equals TL, and a point-view length is 0 ≠ TL, so it is correctly excluded). This is the
    // SAME decision the 2D sheet uses (fvTrue/tvTrue) — read straight from the resolver, not duplicated.
    const fvTrue = Math.abs(M.fvLen - M.tl) < 0.5;
    const tvTrue = Math.abs(M.tvLen - M.tl) < 0.5;
    // A small green "TL" tag rides the true-length projection so the learner sees WHICH view carries
    // the full length; the foreshortened view stays unmarked (inclined-to-both marks neither → only
    // the 3D rod's TL dimension shows, unchanged). Reuses the labels.js factory + the trueLength.js
    // --tl-green style (no second TL system); parented to the view's own group so it swings with the
    // fold and is swept by disposeLabels(group) on rebuild.
    const TL_LIFT = 0.8;

    // Front view a′b′ on VP (amber) — static; green TL tag when the front view is true length.
    if (view.showFV) {
      seg(group, aF, bF, COL.vp, LW.view, false);
      if (fvTrue) {
        const dx = bF[0] - aF[0], dy = bF[1] - aF[1], n = Math.hypot(dx, dy) || 1;
        let px = -dy / n, py = dx / n; if (py < 0) { px = -px; py = -py; } // perpendicular lift, off the view line
        addLabel(group, 'TL', [(aF[0] + bF[0]) / 2 + px * TL_LIFT, (aF[1] + bF[1]) / 2 + py * TL_LIFT, 0],
          { color: '--tl-green', mono: true, size: '10px' });
      }
    }
    // Top view ab on HP (teal) — rides the fold; green TL tag when the top view is true length.
    if (view.showTV) {
      seg(hpGroup, aT, bT, COL.hp, LW.view, false);
      if (tvTrue) {
        const dx = bT[0] - aT[0], dz = bT[2] - aT[2], n = Math.hypot(dx, dz) || 1;
        let px = -dz / n, pz = dx / n; if (pz < 0) { px = -px; pz = -pz; } // perpendicular lift, off the view line
        addLabel(hpGroup, 'TL', [(aT[0] + bT[0]) / 2 + px * TL_LIFT, 0, (aT[2] + bT[2]) / 2 + pz * TL_LIFT],
          { color: '--tl-green', mono: true, size: '10px' });
      }
    }

    // The true line AB in space — always the true length, dark + bold
    seg(group, A, B, COL.ink, LW.bold, false);

    // Formal BIS Type-B True-Length dimension along AB (ADR-041) — the dimension line stands off
    // perpendicular to the rod, ROLLED to face whichever camera is live every frame (ADR-081,
    // orientDimensions() below) instead of a fixed world-up standoff (correct only from Top).
    const va = new THREE.Vector3(...A), vb = new THREE.Vector3(...B);
    const tlDim = addOrientedDimension(group, va, vb,
      { color: COL.ink, resolution: res, materials, widthPx: 1.0, gap: 0.1, overshoot: 0.2, arrowLen: 0.4, offsetLen: DIMENSION_OFFSET, value: `TL ${Math.round(M.tl)}` });
    if (tlDim) dims.push({ entry: tlDim, owner: group });

    // Hand the label system the endpoint coordinates (LOCAL to their owner groups). It creates,
    // positions, and parents every A/B/a/b/a′/b′/θ/φ label — no label logic lives in this leaf.
    linePts = { A, B, aF, bF, aT, bT };
  }

  // Build every 3D label in one place (plane/axis always; endpoints only when a line is on stage).
  labelManager.build({
    view,
    line: linePts,
    theta: resolved?.theta ?? 0,
    phi: resolved?.phi ?? 0,
  });

  // Apply the initial hinge pose so a rebuild mid-fold (or in the folded state) lands in pose.
  hpGroup.rotation.x = foldAngle;

  return {
    group,

    /** Drive the rabatment hinge (0 = open 3D corner, +π/2 = folded flat). Pure
     *  transform — no rebuild while swinging (the fold tween calls this per frame). */
    setFoldAngle(a) { hpGroup.rotation.x = a; },

    /** Re-roll every BIS dimension to face `camera` (ADR-081) — call once per render frame, for
     *  ANY active camera (free-orbit perspective or an engaged ortho quick-view/fold). Pure
     *  transform, like setFoldAngle above: no rebuild. */
    orientDimensions(camera) {
      for (const { entry, owner } of dims) orientDimension(entry, owner, camera);
    },

    /** Keep every fat-line material's resolution in sync with the canvas px size
     *  (ADR-006 §3.16 — stale resolution renders line weights wrong on resize). */
    setResolution(w, h) {
      res.set(Math.max(1, w), Math.max(1, h));
      for (const m of materials) m.resolution.copy(res);
    },

    /** Full disposal (ADR-004 §3.3): remove CSS2D DOM nodes (§3.5), then free every geometry +
     *  material this leaf owns. */
    dispose() {
      labelManager.dispose();  // remove the 3D label system's DOM nodes (§3.5)
      disposeLabels(group);    // sweep the remaining CSS2D DOM: the TL dimension's value label (owned by dimensions.js)
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
