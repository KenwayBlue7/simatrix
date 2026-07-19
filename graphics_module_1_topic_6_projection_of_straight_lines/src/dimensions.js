// dimensions.js — BIS SP 46:2003 Type-B linear-dimension geometry (Phase 4F).
//
// A STATELESS geometry builder (the genericSolid.js / applyShapeTransform-style shared exception
// to the no-cross-import rule, ADR-007 / RULES.md §3.6): it holds no state, touches no DOM, and
// only appends geometry to a caller-supplied group. Both compareSheet.js (the 2D ortho sheet) and
// lineRig.js (the 3D pictorial scene) use it, so the Type-B primitive lives in ONE place — the
// same reasoning ADR-041 gives for Module 2's dimension layer.
//
// A Type-B dimension = continuous NARROW extension + dimension lines (fat Line2 stack at a narrow
// pixel width, ADR-006) + FILLED 3:1 triangle arrowheads (a MeshBasicMaterial triangle soup —
// a fill cannot live in a line batch; ADR-041, matching Module2/src/projectionDrawer.js and
// annotations.js). Extension lines start a `gap` off the measured feature and overshoot the
// dimension line; the arrowhead length : full back width = 3 : 1 (half-width = length / 6).
//
// The numeric VALUE text is a CSS2DObject in Module 2 — that is the CSS2D-label phase and is NOT
// built here (Phase 4F is the dimension GEOMETRY). Colours come from the caller (a CSS token).

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { addLabel } from './labels.js';

/** Push ONE filled 3:1 triangle arrowhead (9 flat floats: tip, +back, −back) — the tip points
 *  `along`, the back edge sits `len` behind it and spans ±len/6 along `perp` (3:1). */
function pushArrow(out, tip, along, perp, len) {
  const base = tip.clone().addScaledVector(along, -len);
  const hw = len / 6;
  const a = base.clone().addScaledVector(perp, hw);
  const b = base.clone().addScaledVector(perp, -hw);
  out.push(tip.x, tip.y, tip.z, a.x, a.y, a.z, b.x, b.y, b.z);
}

/**
 * Append a linear dimension between features A and B, its dimension line stood off perpendicular
 * by `off`. Emits two extension lines (gap off each feature → overshoot past the dimension line),
 * the dimension line, and an outward-pointing FILLED 3:1 arrowhead at each end.
 * @param {THREE.Group}   parent
 * @param {THREE.Vector3} A        first measured feature
 * @param {THREE.Vector3} B        second measured feature
 * @param {THREE.Vector3} off      perpendicular offset to the dimension line (its length = standoff)
 * @param {object} opts  { color, arrowColor?, resolution?, materials?, widthPx?, gap?, overshoot?, arrowLen?, flat? }
 */
export function addLinearDimension(parent, A, B, off, opts) {
  const {
    color, arrowColor = color, resolution, materials,
    widthPx = 1.0, gap = 0.06, overshoot = 0.12, arrowLen = 0.22, flat = false,
    value = null, valueColor = '--color-ink',
  } = opts;

  const dir = off.clone().normalize();          // extension-line direction (unit)
  const Ad = A.clone().add(off);                 // A projected onto the dimension line
  const Bd = B.clone().add(off);                 // B projected onto the dimension line

  const segs = [];
  const seg = (p, q) => segs.push(p.x, p.y, p.z, q.x, q.y, q.z);
  seg(A.clone().addScaledVector(dir, gap), Ad.clone().addScaledVector(dir, overshoot)); // extension A
  seg(B.clone().addScaledVector(dir, gap), Bd.clone().addScaledVector(dir, overshoot)); // extension B
  seg(Ad, Bd);                                                                          // dimension line

  const geo = new LineSegmentsGeometry();
  geo.setPositions(segs);
  const mat = new LineMaterial({ color: color.getHex(), linewidth: widthPx, transparent: true });
  if (resolution) mat.resolution.copy(resolution);
  const lines = new LineSegments2(geo, mat);
  parent.add(lines);
  if (materials) materials.push(mat);

  // Outward filled 3:1 arrowheads: tip at each terminator, back edge splaying along `dir`.
  const t = Bd.clone().sub(Ad).normalize();
  const tri = [];
  pushArrow(tri, Ad, t.clone().negate(), dir, arrowLen);
  pushArrow(tri, Bd, t, dir, arrowLen);
  const ageo = new THREE.BufferGeometry();
  ageo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  const amat = new THREE.MeshBasicMaterial({
    color: arrowColor.getHex(), side: THREE.DoubleSide, transparent: true,
    depthTest: !flat, // 2D sheet: draw over the flat linework; 3D: respect scene depth
  });
  const mesh = new THREE.Mesh(ageo, amat);
  if (flat) mesh.renderOrder = 4;
  parent.add(mesh);

  // The numeric value (CSS2D) — centred on the dimension line, nudged onto a paper break so the
  // dimension line never crosses the digits (the Module 2 makeDimLabel placement, ADR-041).
  if (value != null && value !== '') {
    const mid = Ad.clone().add(Bd).multiplyScalar(0.5).addScaledVector(dir, gap);
    addLabel(parent, String(value), [mid.x, mid.y, mid.z], { color: valueColor, mono: true, size: '10px', break: true });
  }
}
