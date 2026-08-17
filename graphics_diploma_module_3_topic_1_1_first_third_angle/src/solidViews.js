// solidViews.js — the one solid + its three projected views + projector lines (leaf
// module, ADR-007 star topology). Two interchangeable shapes, selected by `shape`:
//
//   'box'     — a plain rectangular block; its three views are three visibly-different
//               rectangles (front L×H, top L×W, side W×H) — enough to teach VIEW
//               POSITION, which is what first-vs-third-angle actually changes (a box
//               has no asymmetry that would change what a view looks like between the
//               two systems, only where it lands on the sheet). Used everywhere except
//               the Compare step.
//   'frustum' — a truncated cone: top view is two concentric circles, front AND side
//               views are the SAME trapezoid (a frustum is rotationally symmetric about
//               its own axis) — the literal solid the BIS symbol abbreviates. Used only
//               on the Compare step, replacing the box outright (not shown alongside it)
//               so the badge's origin is the actual solid on screen, not a separate
//               floating illustration.
//
// The solid body and its projector lines are WORLD-FIXED (added to the orchestrator's
// own group, never a pivot) — only the three view groups ride a plane's fold, and that
// happens automatically because the caller (main.js) parents each one directly onto the
// matching plane's pivot group (planes.js's hp.group / pp.group), or onto the
// stationary VP group for the front view. This leaf never touches a pivot's rotation
// itself.
//
// Layering (RULES.md §3.6): leaf module — imports three only, never a sibling leaf.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SOLID, CENTER_OFFSET, PP_OFFSET, systemSign } from './systemData.js';

const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());
const mixToward = (a, b, t) => a.clone().lerp(b, t);

const LW = { view: 1.7, proj: 1.4 };
const DASH = { dashSize: 0.14, gapSize: 0.10 };

/** Frustum dimensions — sized close to the box's own bounding proportions (R_BIG ≈
 *  half the box's length, HEIGHT ≈ the box's own height) so swapping shapes doesn't
 *  wildly change how much of the plane sheets the solid occupies. */
const FRUSTUM = { R_BIG: 0.85, R_SMALL: 0.45, HEIGHT: 1.0, SEGS: 32, CIRCLE_SEGS: 40 };

function fatLoop(pts, colour, width, dashed, res, mats) {
  const geo = new LineSegmentsGeometry();
  const flat = [];
  for (let i = 0; i < pts.length; i++) flat.push(...pts[i], ...pts[(i + 1) % pts.length]);
  geo.setPositions(flat);
  const mat = new LineMaterial({
    color: colour.getHex(), linewidth: width, worldUnits: false,
    transparent: true, dashed: !!dashed, dashSize: DASH.dashSize, gapSize: DASH.gapSize, dashScale: 1,
  });
  mat.resolution.set(res.x || 1, res.y || 1);
  const line = new LineSegments2(geo, mat);
  if (dashed) line.computeLineDistances();
  mats.push(mat);
  return line;
}

function fatSegment(a, b, colour, dashed, res, mats) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions([...a, ...b]);
  const mat = new LineMaterial({
    color: colour.getHex(), linewidth: LW.proj, worldUnits: false,
    transparent: true, dashed: !!dashed, dashSize: DASH.dashSize, gapSize: DASH.gapSize, dashScale: 1,
  });
  mat.resolution.set(res.x || 1, res.y || 1);
  const line = new LineSegments2(geo, mat);
  if (dashed) line.computeLineDistances();
  mats.push(mat);
  return line;
}

/** Object centre for the active system (Q1 for first-angle, Q3 for third-angle —
 *  the point-reflection precedent from frustums.js). */
export function objectCenter(system) {
  const s = systemSign(system);
  return { x: 0, y: s * CENTER_OFFSET.y, z: s * CENTER_OFFSET.z };
}

/** PP's world-X hinge offset for the active system (right for first, left for third). */
export function ppOffsetFor(system) {
  return systemSign(system) * PP_OFFSET;
}

/**
 * @param {Object} opts
 * @param {string} opts.system  'first' | 'third' (systemData.ProjectionSystem)
 * @param {'box'|'frustum'} [opts.shape='box']
 * @param {number} [opts.width=1]
 * @param {number} [opts.height=1]
 * @returns {{
 *   worldGroup: THREE.Group,        // the solid + projectors — add directly to the scene/content group
 *   topView: THREE.Group,           // parent onto planes.hp.group
 *   frontView: THREE.Group,         // parent onto the stationary VP group
 *   sideView: THREE.Group,          // parent onto planes.pp.group
 *   fLabelAnchor: {x:number,y:number,z:number},
 *   setProjectorsVisible: (on: boolean) => void,
 *   setOpacity: (k: number) => void,
 *   setResolution: (w: number, h: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createSolidAndViews({ system, shape = 'box', width = 1, height = 1 } = {}) {
  const inkCol = cssColor('--color-ink');
  const hpCol = cssColor('--color-hp-line');
  const vpCol = cssColor('--color-vp-line');
  const ppCol = cssColor('--color-pp-line');
  const res = new THREE.Vector2(width, height);
  const lineMats = [];

  const c = objectCenter(system);
  const s = systemSign(system);
  const ppOffset = ppOffsetFor(system);

  const worldGroup = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: mixToward(cssColor('--color-panel'), inkCol, 0.06),
    roughness: 0.9, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });

  const projectors = new THREE.Group();
  const corners2 = (a, b) => [[-a, -b], [a, -b], [a, b], [-a, b]];

  const topView = new THREE.Group();
  const frontView = new THREE.Group();
  const sideView = new THREE.Group();

  // Half-extents used by both branches to size the projector reach and the F-arrow's
  // standoff — for the box these are its own half-dimensions; for the frustum they're
  // the widest radius (X/Z) and half-height, so the SAME projector/eye math below works
  // for either shape without a second code path.
  let halfL, halfH, halfW, boxGeo;

  if (shape === 'frustum') {
    const { R_BIG, R_SMALL, HEIGHT, SEGS, CIRCLE_SEGS } = FRUSTUM;
    halfL = R_BIG; halfH = HEIGHT / 2; halfW = R_BIG;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(R_SMALL, R_BIG, HEIGHT, SEGS), bodyMat);
    body.position.set(c.x, c.y, c.z);
    worldGroup.add(body);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: inkCol }));
    edges.position.copy(body.position);
    worldGroup.add(edges);

    // Top view: two concentric circles (the frustum's own top/bottom rims).
    for (const r of [R_BIG, R_SMALL]) {
      const pts = [];
      for (let i = 0; i < CIRCLE_SEGS; i++) {
        const th = (i / CIRCLE_SEGS) * Math.PI * 2;
        pts.push([c.x + r * Math.cos(th), 0, c.z + r * Math.sin(th)]);
      }
      topView.add(fatLoop(pts, hpCol, LW.view, false, res, lineMats));
    }
    // Front + side views: the SAME trapezoid (rotational symmetry). The body mesh
    // (CylinderGeometry(R_SMALL, R_BIG, HEIGHT) above) is only ever TRANSLATED by
    // c.y between systems, never rotated — so its wide end (R_BIG) is always at the
    // mesh's own local bottom (world y = c.y - halfH) and narrow end (R_SMALL) always
    // at local top (c.y + halfH), regardless of system. Must NOT multiply by s here
    // (that would flip wide/narrow only for third-angle, decoupling the drawn view
    // from the actual solid — a bug caught by checking against the real mesh geometry).
    // sideView lives in PP's local frame (local x=0 on-plane, y=vertical, z=depth),
    // matching planes.js's convention.
    const bigY = c.y - halfH;
    const smallY = c.y + halfH;
    frontView.add(fatLoop(
      [[c.x - R_BIG, bigY, 0], [c.x + R_BIG, bigY, 0], [c.x + R_SMALL, smallY, 0], [c.x - R_SMALL, smallY, 0]],
      vpCol, LW.view, false, res, lineMats,
    ));
    sideView.add(fatLoop(
      [[0, bigY, c.z - R_BIG], [0, bigY, c.z + R_BIG], [0, smallY, c.z + R_SMALL], [0, smallY, c.z - R_SMALL]],
      ppCol, LW.view, false, res, lineMats,
    ));

    // Projectors: 2 per view (the silhouette's left/right extremes), from the rim
    // nearest each plane, straight to that plane's pre-fold position.
    const bottomY = c.y - s * halfH;
    const nearZ = c.z - s * halfW;
    const nearX = c.x + Math.sign(ppOffset || 1) * halfL;
    for (const dx of [-R_BIG, R_BIG]) {
      projectors.add(fatSegment([c.x + dx, bottomY, c.z], [c.x + dx, 0, c.z], hpCol, true, res, lineMats));
    }
    for (const dx of [-R_BIG, R_BIG]) {
      projectors.add(fatSegment([c.x + dx, c.y, nearZ], [c.x + dx, c.y, 0], vpCol, true, res, lineMats));
    }
    for (const dz of [-R_BIG, R_BIG]) {
      projectors.add(fatSegment([nearX, c.y, c.z + dz], [ppOffset, c.y, c.z + dz], ppCol, true, res, lineMats));
    }
  } else {
    const { L, H, W } = SOLID;
    halfL = L / 2; halfH = H / 2; halfW = W / 2;

    boxGeo = new THREE.BoxGeometry(L, H, W);
    const box = new THREE.Mesh(boxGeo, bodyMat);
    box.position.set(c.x, c.y, c.z);
    worldGroup.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: inkCol }));
    edges.position.copy(box.position);
    worldGroup.add(edges);

    topView.add(fatLoop(
      [[c.x - L / 2, 0, c.z - W / 2], [c.x + L / 2, 0, c.z - W / 2], [c.x + L / 2, 0, c.z + W / 2], [c.x - L / 2, 0, c.z + W / 2]],
      hpCol, LW.view, false, res, lineMats,
    ));
    frontView.add(fatLoop(
      [[c.x - L / 2, c.y - H / 2, 0], [c.x + L / 2, c.y - H / 2, 0], [c.x + L / 2, c.y + H / 2, 0], [c.x - L / 2, c.y + H / 2, 0]],
      vpCol, LW.view, false, res, lineMats,
    ));
    sideView.add(fatLoop(
      [[0, c.y - H / 2, c.z - W / 2], [0, c.y - H / 2, c.z + W / 2], [0, c.y + H / 2, c.z + W / 2], [0, c.y + H / 2, c.z - W / 2]],
      ppCol, LW.view, false, res, lineMats,
    ));

    // Projector lines: from the box's face NEAREST each plane, straight to that
    // plane's pre-fold position (12 dashed lines total — 4 per view).
    const bottomY = c.y - s * (H / 2);
    const nearZ = c.z - s * (W / 2);
    const nearX = c.x + Math.sign(ppOffset || 1) * (L / 2);
    for (const [dx, dz] of corners2(L / 2, W / 2)) {
      projectors.add(fatSegment([c.x + dx, bottomY, c.z + dz], [c.x + dx, 0, c.z + dz], hpCol, true, res, lineMats));
    }
    for (const [dx, dy] of corners2(L / 2, H / 2)) {
      projectors.add(fatSegment([c.x + dx, c.y + dy, nearZ], [c.x + dx, c.y + dy, 0], vpCol, true, res, lineMats));
    }
    for (const [dy, dz] of corners2(H / 2, W / 2)) {
      projectors.add(fatSegment([nearX, c.y + dy, c.z + dz], [ppOffset, c.y + dy, c.z + dz], ppCol, true, res, lineMats));
    }
  }
  worldGroup.add(projectors);

  // ── The "arrow F" (BIS pictorial convention, referenced by the Problem Library
  // statements): a real 3D arrow standing where an observer would look FROM to see
  // the front view. The eye's own position does NOT flip with the object's quadrant —
  // first-angle is EYE, OBJECT, PLANE (eye beyond the object, same +Z side, object
  // between eye and VP); third-angle is EYE, PLANE, OBJECT (VP between eye and the
  // object, which has moved to -Z) — both orders put the eye at the SAME fixed +Z
  // "viewing station" beyond VP, on the opposite side from a third-angle object. Using
  // CENTER_OFFSET.z (not c.z, which flips sign with s) keeps the eye there regardless
  // of system; only the object moves.
  const EYE_Z = CENTER_OFFSET.z + halfW + 0.9;
  const fOrigin = new THREE.Vector3(c.x, c.y, EYE_Z);
  const fDir = new THREE.Vector3(0, 0, -1);
  const fArrow = new THREE.ArrowHelper(fDir, fOrigin, 0.7, vpCol.getHex(), 0.22, 0.14);
  worldGroup.add(fArrow);
  /** World anchor for the "F" text chip (labelLayer.js), a touch further out than the
   *  arrow's own tail so the chip reads beside it, not on top of it. */
  const fLabelAnchor = { x: c.x, y: c.y, z: EYE_Z + 0.4 };

  const fadeMats = [];
  for (const grp of [worldGroup, topView, frontView, sideView]) {
    grp.traverse((obj) => {
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      for (const m of mats) fadeMats.push({ mat: m, base: m.opacity ?? 1 });
    });
  }

  return {
    worldGroup, topView, frontView, sideView,
    fLabelAnchor,
    setProjectorsVisible(on) { projectors.visible = on; },
    setOpacity(k) {
      const fading = k < 1;
      if (bodyMat.transparent !== fading) { bodyMat.transparent = fading; bodyMat.depthWrite = !fading; bodyMat.needsUpdate = true; }
      for (const { mat, base } of fadeMats) mat.opacity = base * k;
    },
    setResolution(w, h) { for (const m of lineMats) m.resolution.set(w, h); },
    dispose() {
      for (const grp of [worldGroup, topView, frontView, sideView]) {
        grp.traverse((obj) => {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
          mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
        });
        grp.clear();
      }
    },
  };
}
