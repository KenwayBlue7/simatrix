// frustums.js — the step-5 textbook illustration (leaf module, ADR-007/ADR-033):
// two frustums of a cone, one in Quadrant I and one in Quadrant III, each with its
// top view (two concentric circles) flat on HP and its front view (a trapezoid) on VP.
// The bodies simply FLOAT above their 2D views with NO connecting projector lines —
// a deliberate curriculum-owner call (2026-07-05) to keep the first-angle read as
// clean as possible. This is the classic first-angle/third-angle contrast figure the
// BIS truncated-cone symbol abbreviates (the flat precedent: Module1/firstangle.js
// firstAngleSymbol) — drawn here as real 3D geometry so the learner sees WHY the
// symbol is a circle-pair plus a trapezoid.
//
// World axes (Module-1 family convention): HP = XZ plane (y = 0), VP = XY plane
// (z = 0), fold line = X axis. The Q3 frustum is the point-reflection of the Q1 one
// (big end up, behind VP, below HP), so its views land on the EXTENDED sheets: top
// view on HP behind the wall, front view on VP below the floor — which is why the
// step that shows this leaf also sets showQuad.
//
// The fold: the top-view circles live IN the HP sheet, so they sit in an internal
// pivot hinged on the X axis, mirroring the hvPlanes.js hinge; the orchestrator
// drives every leaf's setFoldAngle(a) from the one easeFold tween. Nothing else
// moves during the fold — with the body→view projectors removed there is no world-
// space line to re-stretch, so the front views and bodies simply hold still.
//
// Layering (RULES.md §3.6): leaf module — imports three only, never a sibling leaf.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ── Token access — colours come from CSS custom properties, never hard-coded
//    (RULES.md §4.1). Blends only mix existing tokens (no new palette colours).
const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());
const mixToward = (a, b, t) => a.clone().lerp(b, t);

// ── Body + view constants (world units / CSS px) ──
const R_BIG = 0.9;         // frustum base radius = outer top-view circle
const R_SMALL = 0.5;       // frustum top radius = inner top-view circle
const HEIGHT = 1.4;        // frustum height = trapezoid height on VP
const BODY_SEGS = 32;      // lathe resolution of the solid
const CIRCLE_SEGS = 48;    // fat-line segments per top-view circle
const LW = { view: 1.7 };  // view outline / projector weight (px) — matches point.js
const DASH = { dashSize: 0.20, gapSize: 0.13 };

/** The two bodies. Q3 is the point-reflection of Q1 through the origin (`flip`
 *  turns the mesh big-end-up), so each front-view trapezoid below is the exact
 *  projection of its own mesh — wide side down in Q1, wide side up in Q3. */
const BODIES = [
  { center: { y: 1.6, z: 1.6 }, flip: false },   // Quadrant I
  { center: { y: -1.6, z: -1.6 }, flip: true },  // Quadrant III
];

/** One fat-line segment batch (LineSegments2 + LineMaterial — ADR-006). `flat` is
 *  [x1,y1,z1,x2,y2,z2, …] per segment; width in px; dashed needs the line distances
 *  computed before first render. The material registers in `mats` so
 *  setResolution() keeps its on-screen weight correct on resize. */
function fatSegments(flat, colour, width, dashed, res, mats) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(flat);
  const mat = new LineMaterial({
    color: colour.getHex(), linewidth: width, worldUnits: false,
    transparent: true, dashed: !!dashed,
    dashSize: DASH.dashSize, gapSize: DASH.gapSize, dashScale: 1,
  });
  mat.resolution.set(res.x || 1, res.y || 1);
  const line = new LineSegments2(geo, mat);
  // Only dashed lines need the per-vertex distance attribute the dash shader samples;
  // a solid line ignores it — and with the body→view projectors gone, every frustum
  // line IS solid, so this branch no longer fires (the param stays for helper parity
  // with point.js's fatSegment).
  if (dashed) line.computeLineDistances();
  mats.push(mat);
  return line;
}

/** Closed-loop corner list → flat segment array for fatSegments. */
function loopFlat(pts) {
  const flat = [];
  for (let i = 0; i < pts.length; i++) {
    flat.push(...pts[i], ...pts[(i + 1) % pts.length]);
  }
  return flat;
}

/**
 * Build the two-frustum illustration.
 *
 * @param {Object} opts
 * @param {number} [opts.foldAngle=0]  Initial hinge angle (rad), so a rebuild
 *   mid-fold or in the folded state lands the riding top views in pose.
 * @param {number} [opts.width=1]      Viewport CSS px (LineMaterial.resolution).
 * @param {number} [opts.height=1]
 * @returns {{ group: THREE.Group,
 *             setFoldAngle: (a: number) => void,
 *             setResolution: (w: number, h: number) => void,
 *             dispose: () => void }}
 */
export function createFrustums({ foldAngle = 0, width = 1, height = 1 } = {}) {
  const panel = cssColor('--color-panel');
  const inkCol = cssColor('--color-ink');
  const hpCol = cssColor('--color-hp-line');
  const vpCol = cssColor('--color-vp-line');

  const group = new THREE.Group();
  const lineMats = [];
  const res = new THREE.Vector2(width, height);

  /** The riding top views' hinge (mirrors the hvPlanes.js pivot). */
  const hpRiders = new THREE.Group();
  hpRiders.rotation.x = foldAngle;
  group.add(hpRiders);

  // The solid body reads as a paper-craft model: panel nudged a touch toward ink
  // (token blend, hvPlanes.js precedent) so it separates from the paper background,
  // matte (roughness .9) under the flat CAD light. OPAQUE — the translucent sheet
  // fills + grids draw in the later transparent pass and overlay the Q3 body,
  // which is exactly the "seen through the planes" cage effect the step wants.
  // polygonOffset keeps the depth pass honest against coplanar linework (§3.18).
  const bodyMat = new THREE.MeshStandardMaterial({
    color: mixToward(panel, inkCol, 0.06),
    roughness: 0.9, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });

  for (const { center, flip } of BODIES) {
    const { y: cy, z: cz } = center;

    // ── The solid: CylinderGeometry(top, bottom, …) = big end down; the Q3 body
    //    flips upside down (its point-reflected pose).
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(R_SMALL, R_BIG, HEIGHT, BODY_SEGS),
      bodyMat,
    );
    if (flip) body.rotation.x = Math.PI;
    body.position.set(0, cy, cz);
    // While the 4↔5 cross-fade holds the body in the TRANSPARENT pass (setOpacity
    // k < 1), draw order must reproduce the settled opaque composite. The Q3 body
    // sits BEHIND the translucent sheets, so it draws before their fills (-2) and
    // grids (-1) — otherwise it paints over the cage for the whole fade and the
    // cage snaps onto it the frame the body turns opaque again. The Q1 body sits
    // IN FRONT of the sheets, so the default order (0, after the grids) is right.
    if (flip) body.renderOrder = -3;
    group.add(body);

    // ── Top view on HP: both rims project as concentric circles about (0, ·, cz).
    //    Teal + solid (HP's Two-Cue linework); rides the trapdoor.
    for (const r of [R_BIG, R_SMALL]) {
      const pts = [];
      for (let i = 0; i < CIRCLE_SEGS; i++) {
        const th = (i / CIRCLE_SEGS) * Math.PI * 2;
        pts.push([r * Math.cos(th), 0, cz + r * Math.sin(th)]);
      }
      hpRiders.add(fatSegments(loopFlat(pts), hpCol, LW.view, false, res, lineMats));
    }

    // ── Front view on VP: the exact silhouette — a trapezoid, wide edge at the
    //    big rim's height. Amber + solid (the sheet-border override carries the
    //    same solid amber language — see hvPlanes.js). Stationary through the fold.
    const bigY = cy + (flip ? HEIGHT / 2 : -HEIGHT / 2);
    const smallY = cy + (flip ? -HEIGHT / 2 : HEIGHT / 2);
    group.add(fatSegments(
      loopFlat([[-R_BIG, bigY, 0], [R_BIG, bigY, 0], [R_SMALL, smallY, 0], [-R_SMALL, smallY, 0]]),
      vpCol, LW.view, false, res, lineMats,
    ));

    // ── No projectors: the body simply floats above its top/front views. The
    //    dashed body→HP foot-tracker and the solid body→VP line were removed
    //    (2026-07-05) to keep the first-angle illustration uncluttered.
  }

  // Every material this illustration created, paired with its own target opacity, so
  // the orchestrator can fade the frustums in on the 4→5 cross-fade. (bodyMat appears
  // once per body mesh — harmless; setOpacity writes it either way.)
  const fadeMats = [];
  group.traverse((obj) => {
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    for (const m of mats) fadeMats.push({ mat: m, base: m.opacity ?? 1 });
  });

  return {
    group,

    /** Drive the rabatment: rotate the riding top views with the folding floor.
     *  Pure transform — safe every tween frame. (With the body→view projectors
     *  removed there is no world-space line left to re-stretch.) */
    setFoldAngle(a) {
      hpRiders.rotation.x = a;
    },

    /** Fade the illustration in/out: multiply every material's target opacity by `k`.
     *  The solid body is normally OPAQUE (so the translucent sheet grids overlay it —
     *  the "cage" read); it only turns transparent WHILE fading (k < 1) and snaps back
     *  to opaque at k = 1, so the settled look is unchanged. Toggling `transparent`
     *  recompiles the shader, so that only happens on the two frames the fade starts
     *  and ends, never per-frame. */
    setOpacity(k) {
      const fading = k < 1;
      if (bodyMat.transparent !== fading) {
        bodyMat.transparent = fading;
        bodyMat.depthWrite = !fading; // let the translucent body blend cleanly while fading
        bodyMat.needsUpdate = true;
      }
      for (const { mat, base } of fadeMats) mat.opacity = base * k;
    },

    /** Keep every LineMaterial's resolution in sync with the viewport
     *  (RULES.md §3.16). */
    setResolution(w, h) {
      for (const m of lineMats) m.resolution.set(w, h);
    },

    /** Full disposal contract (ADR-004): free every geometry + material this
     *  builder created (no textures here → GL stays flat), then empty the group. */
    dispose() {
      group.traverse((obj) => {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      });
      group.clear();
    },
  };
}
