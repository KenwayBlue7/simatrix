// planes.js — the three reference planes (leaf module, ADR-007 star topology): HP
// (floor), VP (the stationary drawing sheet — front view, never folds), and PP (the
// profile plane — side view). Pattern ported from
// graphics_module_1_topic_2_spatial_framework/src/hvPlanes.js (fat-line sheets, faint
// fills, a "cage" grid, a pivot-hinged fold) and extended with a THIRD plane PP,
// whose pivot sits offset from VP's centre by PP_OFFSET (systemSign-dependent —
// see systemData.js) rather than at the origin.
//
// World axes (Module-1 family convention): HP = XZ plane (y=0) · VP = XY plane
// (z=0) · PP = a plane perpendicular to X, hinged on the vertical line where it
// meets VP (x = pivotX, z=0). HP's hinge is the horizontal line where it meets VP
// (y=0, z=0) — the X axis.
//
// Both HP and PP are built as ONE rigid core+extension sheet (mirroring hvPlanes.js's
// "four rooms" pattern): folding is a SINGLE constant rotation regardless of which
// system is active — it is the OBJECT's quadrant (Q1 vs Q3, systemData.js) and PP's
// own pivot offset side that determine which half's content ends up where after the
// fold, not a per-system fold-direction branch. Verified numerically before this file
// was written (scratchpad/verify_projection_geom.mjs).
//
// Layering (RULES.md §3.6): leaf module — imports three only, never a sibling leaf.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());
const mixToward = (a, b, t) => a.clone().lerp(b, t);

const SHEET = 6;
const HALF = SHEET / 2;
const LW = { edge: 2.6, border: 1.6 };
const FILL = { hp: 0.10, vp: 0.07, pp: 0.08, mix: 0.72 };
const GRID = { opacity: 0.5, fade: 0.62, divs: 16 };
const GRID_CELL = SHEET / GRID.divs;

/** HP folds by a CONSTANT +90° about the X axis — no system dependence (verified). */
export const HP_FOLD_ANGLE = Math.PI / 2;
/** PP folds by a CONSTANT -90° about its own (offset) Y axis — no system dependence. */
export const PP_FOLD_ANGLE = -Math.PI / 2;

function fatSegments(flat, colour, width, res, mats) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(flat);
  const mat = new LineMaterial({ color: colour.getHex(), linewidth: width, worldUnits: false, transparent: true });
  mat.resolution.set(res.x || 1, res.y || 1);
  const line = new LineSegments2(geo, mat);
  mats.push(mat);
  return line;
}

function loopFlat(pts) {
  const flat = [];
  for (let i = 0; i < pts.length; i++) flat.push(...pts[i], ...pts[(i + 1) % pts.length]);
  return flat;
}

/** The plane-hued grid: thin native lines, hue faded toward paper. `map(u,v)` places a
 *  grid vertex on the plane — the same generator serves any of the three planes. */
function calmGrid(map, u0, u1, v0, v1, hue, paper) {
  const pos = [];
  const uSteps = Math.round((u1 - u0) / GRID_CELL);
  const vSteps = Math.round((v1 - v0) / GRID_CELL);
  for (let i = 0; i <= uSteps; i++) { const u = u0 + i * GRID_CELL; pos.push(...map(u, v0), ...map(u, v1)); }
  for (let i = 0; i <= vSteps; i++) { const v = v0 + i * GRID_CELL; pos.push(...map(u0, v), ...map(u1, v)); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: mixToward(hue, paper, GRID.fade), transparent: true, opacity: GRID.opacity, depthWrite: false });
  const grid = new THREE.LineSegments(geo, mat);
  grid.renderOrder = -1;
  return grid;
}

/** One hinged sheet (HP or PP): a core half + an extension half, sharing a fold
 *  pivot. `axis` picks which local rotation the pivot uses ('x' for HP, 'y' for PP).
 *  `mapLocal(u,v)` places a point in the PIVOT's local space (so the caller controls
 *  which plane/orientation this sheet occupies before folding). */
function buildHingedSheet({ axis, mapLocal, hue, fillOpacity, foldAngle, width, height }) {
  const paper = cssColor('--color-paper');
  const inkCol = cssColor('--color-ink');
  const pivot = new THREE.Group();
  const lineMats = [];
  const coreMats = [];
  const res = new THREE.Vector2(width, height);

  const sheetFill = (w, h, mapper, opacity, bucket) => {
    // Build a quad from the mapper directly (not THREE.PlaneGeometry) so it works for
    // either local orientation (HP maps XZ, PP maps YZ) without a rotation correction.
    const geo = new THREE.BufferGeometry();
    const p00 = mapper(-w / 2, -h / 2), p10 = mapper(w / 2, -h / 2), p11 = mapper(w / 2, h / 2), p01 = mapper(-w / 2, h / 2);
    const pos = [...p00, ...p10, ...p11, ...p00, ...p11, ...p01];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: mixToward(hue, paper, FILL.mix), transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
    }));
    mesh.renderOrder = -2;
    bucket.push({ mat: mesh.material, base: opacity });
    return mesh;
  };

  const gridInto = (bucket, mapper, u0, u1, v0, v1) => {
    const grid = calmGrid(mapper, u0, u1, v0, v1, hue, paper);
    bucket.push({ mat: grid.material, base: GRID.opacity });
    return grid;
  };

  const stroke = (flat, colour, bucket, w = LW.border) => {
    const line = fatSegments(flat, colour, w, res, lineMats);
    bucket.push({ mat: line.material, base: 1 });
    return line;
  };

  // Core: the "live" half for the FIRST-angle placement (u∈[0,HALF]). Extension: the
  // THIRD-angle half (u∈[-HALF,0]) — both always built, so the same rigid pivot fold
  // carries whichever half the active object's quadrant put content on.
  const core = sheetFill(SHEET, HALF, (u, v) => mapLocal(u, v + HALF / 2), FILL[axis === 'x' ? 'hp' : 'pp'], coreMats);
  pivot.add(core);
  pivot.add(gridInto(coreMats, (u, v) => mapLocal(u, v), -HALF, HALF, 0, HALF));
  pivot.add(stroke(loopFlat([mapLocal(-HALF, 0), mapLocal(HALF, 0), mapLocal(HALF, HALF), mapLocal(-HALF, HALF)]), hue, coreMats));

  const ext = sheetFill(SHEET, HALF, (u, v) => mapLocal(u, v - HALF / 2), FILL[axis === 'x' ? 'hp' : 'pp'], coreMats);
  pivot.add(ext);
  pivot.add(gridInto(coreMats, (u, v) => mapLocal(u, v), -HALF, HALF, -HALF, 0));
  pivot.add(stroke([
    ...mapLocal(-HALF, -HALF), ...mapLocal(HALF, -HALF),
    ...mapLocal(-HALF, -HALF), ...mapLocal(-HALF, 0),
    ...mapLocal(HALF, -HALF), ...mapLocal(HALF, 0),
  ], hue, coreMats));

  // The fold (hinge) line itself, ink, drawn last.
  pivot.add(stroke([...mapLocal(-HALF, 0), ...mapLocal(HALF, 0)], inkCol, coreMats, LW.edge));

  if (axis === 'x') pivot.rotation.x = foldAngle;
  else pivot.rotation.y = foldAngle;

  let leafK = 1;
  const stamp = () => { for (const { mat, base } of coreMats) mat.opacity = base * leafK; };
  stamp();

  return {
    group: pivot,
    setFoldAngle(a) { if (axis === 'x') pivot.rotation.x = a; else pivot.rotation.y = a; },
    setOpacity(k) { leafK = k; stamp(); },
    setResolution(w, h) { for (const m of lineMats) m.resolution.set(w, h); },
    dispose() {
      pivot.traverse((obj) => {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        mats.forEach((m) => m.dispose());
      });
      pivot.clear();
    },
  };
}

/**
 * Build all three reference planes.
 * @param {Object} opts
 * @param {number} opts.ppOffset  Signed world-X offset of PP's hinge (systemSign * PP_OFFSET).
 * @param {number} [opts.hpFoldAngle=0]
 * @param {number} [opts.ppFoldAngle=0]
 * @param {number} [opts.width=1]
 * @param {number} [opts.height=1]
 * @returns {{ group: THREE.Group, hp: object, vp: object, pp: object,
 *             setFoldAngles: (hp:number, pp:number) => void,
 *             setResolution: (w:number,h:number) => void, dispose: () => void }}
 */
export function createPlanes({ ppOffset, hpFoldAngle = 0, ppFoldAngle = 0, width = 1, height = 1 } = {}) {
  const group = new THREE.Group();
  const hpCol = cssColor('--color-hp-line');
  const vpCol = cssColor('--color-vp-line');
  const ppCol = cssColor('--color-pp-line'); // PP Violet — the platform's third projection-plane token (DESIGN.md §7.1)

  // HP: local (u,v) = world (x, 0, v) with v the signed Z offset from the fold line.
  const hp = buildHingedSheet({
    axis: 'x', hue: hpCol, foldAngle: hpFoldAngle, width, height,
    mapLocal: (u, v) => [u, 0, v],
  });
  group.add(hp.group);

  // VP: stationary, never folds — a plain fixed sheet spanning both above/below XY
  // (it must show the flattened top/side views landing on it too, post-fold). Its own
  // dedicated sub-group (NOT the top-level `group`) — vp.group must be VP-only content
  // so main.js can set its visibility independently of HP/PP (a shared top-level group
  // would make setting one plane's visibility clobber the others').
  const vpGroup = new THREE.Group();
  const vpMats = [];
  const vpLineMats = [];
  const vpFill = new THREE.Mesh(
    new THREE.PlaneGeometry(SHEET, SHEET),
    new THREE.MeshBasicMaterial({ color: mixToward(vpCol, cssColor('--color-paper'), FILL.mix), transparent: true, opacity: FILL.vp, side: THREE.DoubleSide, depthWrite: false }),
  );
  vpFill.renderOrder = -2;
  vpMats.push({ mat: vpFill.material, base: FILL.vp });
  vpGroup.add(vpFill);
  const vpGrid = calmGrid((u, v) => [u, v, 0], -HALF, HALF, -HALF, HALF, vpCol, cssColor('--color-paper'));
  vpMats.push({ mat: vpGrid.material, base: GRID.opacity });
  vpGroup.add(vpGrid);
  const res = new THREE.Vector2(width, height);
  const vpBorderLine = fatSegments(loopFlat([[-HALF, -HALF, 0], [HALF, -HALF, 0], [HALF, HALF, 0], [-HALF, HALF, 0]]), vpCol, LW.border, res, vpLineMats);
  vpMats.push({ mat: vpBorderLine.material, base: 1 });
  vpGroup.add(vpBorderLine);
  group.add(vpGroup);

  let vpK = 1;
  const vp = {
    group: vpGroup,
    setOpacity(k) { vpK = k; for (const { mat, base } of vpMats) mat.opacity = base * vpK; },
    setResolution(w, h) { for (const m of vpLineMats) m.resolution.set(w, h); },
    dispose() {
      vpFill.geometry.dispose(); vpFill.material.dispose();
      vpGrid.geometry.dispose(); vpGrid.material.dispose();
      vpBorderLine.geometry.dispose(); vpBorderLine.material.dispose();
    },
  };

  // PP: local (u,v) = world (ppOffset, v_local_as_y? ...) — PP's plane is perpendicular
  // to X, so its own "u,v" in-plane axes are (Y, Z): local point (0, u, v) offset by
  // ppOffset in X. Hinge rotates about the pivot's local Y axis (vertical) — mapLocal's
  // "u" here is actually the vertical (world Y) axis so the sheet stands upright.
  const ppPivotGroup = new THREE.Group();
  ppPivotGroup.position.set(ppOffset, 0, 0);
  const pp = buildHingedSheet({
    axis: 'y', hue: ppCol, foldAngle: ppFoldAngle, width, height,
    mapLocal: (u, v) => [0, u, v], // local x=0 (on the PP plane), y=u (vertical), z=v (depth from hinge)
  });
  ppPivotGroup.add(pp.group);
  group.add(ppPivotGroup);

  return {
    group,
    hp, vp, pp,
    ppPivotGroup,
    setFoldAngles(hpAngle, ppAngle) { hp.setFoldAngle(hpAngle); pp.setFoldAngle(ppAngle); },
    setOpacity(k) { hp.setOpacity(k); vp.setOpacity(k); pp.setOpacity(k); },
    setResolution(w, h) { hp.setResolution(w, h); vp.setResolution(w, h); pp.setResolution(w, h); },
    dispose() { hp.dispose(); vp.dispose(); pp.dispose(); },
  };
}
