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
//
// CAMERA-AWARE 3D DIMENSIONS (ADR-081). `addLinearDimension` above takes a FIXED world-space
// `off` — correct for the flat 2D Compare sheet (a square-on ortho camera that never moves,
// compareSheet.js's `addViewDim`), wrong for the free-orbiting 3D scene: a fixed `off` is only
// ⟂-to-the-rod IN SCREEN SPACE from the one vantage it was chosen for (Top), and reads as a
// skewed parallelogram + edge-on arrowhead slivers from Front/Side. `addOrientedDimension` below
// is the 3D-scene counterpart: it builds the SAME geometry (same extension/dimension-line/3:1-
// arrowhead math) in a dedicated child GROUP's own local frame — rod along local +X, standoff
// along local +Y — so the caller's per-frame `orientDimension()` can roll that group's local Y
// to face the CURRENT camera (`off_local = normalize(rod × viewDir)`) without moving a single
// vertex. The ticks/arrowheads stay pinned to their real endpoints (only the group's rotation
// changes) while landing screen-perpendicular in every view — Top is the fixed point of this
// roll (reproduces the old formula up to sign), so it cannot regress.

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

/** Write an orthonormal basis (xAxis local +X, yAxis local +Y, their cross local +Z) onto
 *  `group.quaternion` — the ONE place either constructor below writes a rotation (mirrors
 *  labels/LabelManager.js's "single writer" discipline). `xAxis`/`yAxis` must already be unit
 *  and mutually perpendicular (both callers below guarantee this by construction). */
function applyBasis(group, xAxis, yAxis) {
  const zAxis = _zAxis.crossVectors(xAxis, yAxis).normalize();
  group.quaternion.setFromRotationMatrix(_basisM.makeBasis(xAxis, yAxis, zAxis));
}
const _zAxis = new THREE.Vector3();
const _basisM = new THREE.Matrix4();

/**
 * Build a camera-aware BIS Type-B dimension for the 3D scene (ADR-081): identical geometry to
 * `addLinearDimension` (continuous extension + dimension lines, filled 3:1 arrowheads, the
 * optional CSS2D value), but built once in a dedicated child GROUP's own local frame — rod along
 * local +X, standoff along local +Y — instead of a caller-fixed world `off`. The group is parented
 * at the rod's midpoint; its rotation (and ONLY its rotation) is re-driven every frame by
 * `orientDimension()` below, so the geometry never needs rebuilding as the camera orbits.
 * @param {THREE.Group}   parent   the owner group (e.g. the static rig root, or the folding HP
 *                                 group) — dimension geometry is expressed in ITS local space
 * @param {THREE.Vector3} A        first measured feature (parent-local)
 * @param {THREE.Vector3} B        second measured feature (parent-local)
 * @param {object} opts  { color, arrowColor?, resolution?, materials?, widthPx?, gap?, overshoot?,
 *                          arrowLen?, offsetLen, value?, valueColor? }
 * @returns {?{ group: THREE.Group, dLocal: THREE.Vector3, prevPerp: THREE.Vector3 }} an entry for
 *   `orientDimension()` to track every frame, or null for a degenerate (coincident) A/B.
 */
export function addOrientedDimension(parent, A, B, opts) {
  const {
    color, arrowColor = color, resolution, materials,
    widthPx = 1.0, gap = 0.06, overshoot = 0.12, arrowLen = 0.22, offsetLen = 0.5,
    value = null, valueColor = '--color-ink',
  } = opts;

  const mid = A.clone().add(B).multiplyScalar(0.5);
  const dLocal = B.clone().sub(A);
  const len = dLocal.length();
  if (len < 1e-4) return null;
  dLocal.normalize();

  const group = new THREE.Group();
  group.position.copy(mid);
  parent.add(group);

  // Everything below is expressed in the GROUP's own local (widget) space: rod along +X, centred
  // on the origin (the group's position already carries the world midpoint); standoff along +Y,
  // at a FIXED offsetLen — the widget itself is static, only the group's rotation (applyBasis)
  // ever changes, which is what lets orientDimension() reorient it with zero per-frame geometry
  // rebuild.
  const half = len / 2;
  const t = new THREE.Vector3(1, 0, 0);      // widget rod axis
  const dir = new THREE.Vector3(0, 1, 0);    // widget standoff axis (extension-line direction)
  const A0 = new THREE.Vector3(-half, 0, 0), B0 = new THREE.Vector3(half, 0, 0);
  const Ad = new THREE.Vector3(-half, offsetLen, 0), Bd = new THREE.Vector3(half, offsetLen, 0);

  const segs = [];
  const seg = (p, q) => segs.push(p.x, p.y, p.z, q.x, q.y, q.z);
  seg(A0.clone().addScaledVector(dir, gap), Ad.clone().addScaledVector(dir, overshoot)); // extension A
  seg(B0.clone().addScaledVector(dir, gap), Bd.clone().addScaledVector(dir, overshoot)); // extension B
  seg(Ad, Bd);                                                                           // dimension line

  const geo = new LineSegmentsGeometry();
  geo.setPositions(segs);
  const mat = new LineMaterial({ color: color.getHex(), linewidth: widthPx, transparent: true });
  if (resolution) mat.resolution.copy(resolution);
  const lines = new LineSegments2(geo, mat);
  group.add(lines);
  if (materials) materials.push(mat);

  // Outward filled 3:1 arrowheads — same pushArrow math as the flat builder above, `perp` = the
  // widget's own standoff axis (`dir`), so the roll that faces `dir` at the camera (orientDimension)
  // widens the triangle's back edge into the screen plane too — no separate arrowhead fix needed.
  const tri = [];
  pushArrow(tri, Ad, t.clone().negate(), dir, arrowLen);
  pushArrow(tri, Bd, t, dir, arrowLen);
  const ageo = new THREE.BufferGeometry();
  ageo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  const amat = new THREE.MeshBasicMaterial({ color: arrowColor.getHex(), side: THREE.DoubleSide, transparent: true });
  group.add(new THREE.Mesh(ageo, amat));

  // The numeric value (CSS2D) — a child of the group, so it rides the roll like everything else;
  // CSS2DObject always renders screen-facing regardless of its parent's rotation, so only its
  // (rolling) POSITION needs to track the dimension line, not its orientation.
  if (value != null && value !== '') {
    const lp = new THREE.Vector3(0, offsetLen + gap, 0);
    addLabel(group, String(value), [lp.x, lp.y, lp.z], { color: valueColor, mono: true, size: '10px', break: true });
  }

  // Seed the initial roll with the SAME fixed world-up formula the old (pre-ADR-081) dimension
  // used — an arbitrary but deterministic starting perpendicular, so the widget already renders
  // correctly (not just identity-rotated) even if `orientDimension()` is never called (e.g. a
  // headless check right after rebuild, before the render loop's next frame). The Top quick-view
  // reproduces this exact formula (see orientDimension's doc), so this seed IS Top's final pose.
  const up = Math.abs(dLocal.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const seedPerp = new THREE.Vector3().crossVectors(dLocal, up).normalize();
  applyBasis(group, dLocal, seedPerp);

  return { group, dLocal, prevPerp: seedPerp };
}

const _viewWorld = new THREE.Vector3();
const _viewLocal = new THREE.Vector3();
const _worldMid = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const _perp = new THREE.Vector3();

/**
 * Re-roll one `addOrientedDimension()` entry to face `camera` — call every frame (mirrors
 * lineRig's `setFoldAngle`: a pure transform, never a rebuild). Rotates the group's local +Y
 * (the standoff/extension-line axis) to the perpendicular of the rod that is ALSO perpendicular
 * to the current view direction — `off_local = normalize(rod × viewDir)` — which is exactly the
 * condition for the extension lines and arrowheads to project screen-perpendicular to the
 * dimension line, in ANY view. At Top (`viewDir = (0,−1,0)` in world space) this reduces to
 * `(−rod.z, 0, rod.x)`, the OLD fixed formula — Top is a fixed point of this roll, not a special
 * case, so it cannot regress.
 * @param {{group,dLocal,prevPerp}} entry   an addOrientedDimension() return value
 * @param {THREE.Object3D}          ownerGroup  the SAME `parent` the entry's group was added to
 *   (its world rotation is divided out below, so a dimension riding a folding group like `hpGroup`
 *   still rolls correctly against the camera — see lineRig.js/lineTypeRig.js call sites)
 * @param {THREE.Camera} camera
 */
export function orientDimension(entry, ownerGroup, camera) {
  const { group, dLocal, prevPerp } = entry;

  // View direction, WORLD space: the fixed forward axis for an ortho quick-view camera (the whole
  // point of "square-on to the plane"), or camera→rod-midpoint for the free-orbit perspective
  // camera (a single global forward would be wrong for a rod off-centre in the frame).
  group.getWorldPosition(_worldMid);
  const viewWorld = camera.isOrthographicCamera
    ? camera.getWorldDirection(_viewWorld)
    : _viewWorld.copy(_worldMid).sub(camera.position).normalize();

  // Into the OWNER's local space — a pure rotation (no translation), so applying the owner's
  // inverse world quaternion to a direction vector is exact even while the owner itself is
  // mid-fold-tween.
  ownerGroup.getWorldQuaternion(_invQuat).invert();
  const viewLocal = _viewLocal.copy(viewWorld).applyQuaternion(_invQuat);

  _perp.crossVectors(dLocal, viewLocal);
  let perp = prevPerp;
  if (_perp.lengthSq() > 1e-8) {                 // else: rod running end-on to the camera — hold
    _perp.normalize();                           // the last good basis rather than degenerate
    if (_perp.dot(prevPerp) < 0) _perp.negate(); // continuity: never snap the dimension across
    perp = _perp;                                // the rod as the camera orbits past it
    prevPerp.copy(perp);
  }
  applyBasis(group, dLocal, perp);
}
