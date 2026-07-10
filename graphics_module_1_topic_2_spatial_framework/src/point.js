// point.js — the point being positioned (leaf module, ADR-007/ADR-033): the physical
// point P floating in space, its two views — the top view p on HP and the front view
// p′ on VP — and the perpendicular projectors that connect them. Receives P's world
// position already resolved + scaled by the orchestrator (spatialData.resolvePosition
// remapped to world axes in main.js — the same data-space → draw-space split the
// legacy Points/quadrants/firstangle lessons used).
//
// Drawing conventions (ADR-016, N.D. Bhatt / SP 46:2003):
//   • P        — small ink sphere lifted off the linework by a faint paper halo.
//   • p, p′    — THICK FILLED DOTS (paper halo + plane-hued disc), never crosses;
//                p lies flat in HP, p′ upright in VP.
//   • projector P→p — the HP pictorial projector, DASHED teal (3D projectors stay
//                dashed on the HP side); its in-plane connector to the fold line is
//                teal solid (HP's Two-Cue weight).
//   • projector P→p′ — the VP pictorial projector, DASHED amber (3D-space
//                projectors stay dashed on the VP side too, mirroring P→p on HP).
//   • p′→fold line connector — SOLID amber. NARROW curriculum-owner override
//                (2026-07-05): ONLY the amber linework drawn IN the VP plane bypasses
//                the Two-Cue rule, to echo the SOLID amber VP sheet border in
//                hvPlanes.js. The 3D-space P→p′ projector keeps its dashes.
// All linework is the fat-line stack (LineSegments2 + LineMaterial, ADR-006) so it
// keeps a constant on-screen weight at any zoom.
//
// The fold: the pieces that live IN the HP sheet (the dot p and its connector to
// the fold line) sit in an internal pivot group hinged on the X axis, mirroring the
// hvPlanes.js hinge — the orchestrator drives both leaves' setFoldAngle(a) from one
// tween, so the top view rides the folding floor while p′ never moves. The dashed
// P→p projector re-stretches to the riding foot each frame by writing into its
// existing instanced buffers (no per-frame geometry allocation).
//
// Layering (RULES.md §3.6): leaf module — imports three only, never a sibling leaf.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ── Token access — colours come from CSS custom properties, never hard-coded
//    (RULES.md §4.1).
const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

// ── Marker + stroke constants (legacy Module-1 values, world units / CSS px) ──
const P_RADIUS = 0.16;     // the ink sphere for P
const FOOT_RADIUS = 0.14;  // legacy acr() r → disc = r·0.8, halo = disc·1.5
const LW = { proj: 1.7 };  // projector / connector weight (px)
const DASH = { dashSize: 0.20, gapSize: 0.13 };

// Dashed projectors START this far off P, toward their view foot, so the dash
// pattern begins at the SPHERE SURFACE rather than buried inside P's marker
// (P_RADIUS 0.16, halo ~0.25 — 0.20 lands on the sphere's skin). This sidesteps a
// LineSegments2 dash-shader overlap artifact seen on some Linux GL drivers, where a
// dash starting exactly at P rendered as a visible GAP that "detached" the projector
// from the point. Purely a start-coordinate nudge — the endpoint on the plane is
// untouched, so lengths / dash phase downstream read the same.
const SPHERE_GAP = 0.20;

/** The projector's start point, nudged SPHERE_GAP off P toward (tx,ty,tz). Clamps so
 *  a very short projector (P sitting almost on the plane) never overshoots its foot. */
function nudgeOffP(px, py, pz, tx, ty, tz) {
  const dx = tx - px, dy = ty - py, dz = tz - pz;
  const len = Math.hypot(dx, dy, dz) || 1;
  const k = Math.min(SPHERE_GAP, len) / len;
  return { x: px + dx * k, y: py + dy * k, z: pz + dz * k };
}

/** One fat-line segment (LineSegments2 + LineMaterial — ADR-006). Registers its
 *  material in `mats` for resolution sync on resize. */
function fatSegment(x1, y1, z1, x2, y2, z2, colour, dashed, res, mats) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions([x1, y1, z1, x2, y2, z2]);
  const mat = new LineMaterial({
    color: colour.getHex(), linewidth: LW.proj, worldUnits: false,
    transparent: true, dashed: !!dashed,
    dashSize: DASH.dashSize, gapSize: DASH.gapSize, dashScale: 1,
  });
  mat.resolution.set(res.x || 1, res.y || 1);
  const line = new LineSegments2(geo, mat);
  // Only dashed lines need the per-vertex distance attribute the dash shader samples;
  // a solid line ignores it, so skip the compute for the solid in-plane connectors.
  if (dashed) line.computeLineDistances();
  mats.push(mat);
  return line;
}

/** Rewrite an existing single-segment fat line IN PLACE — endpoints + the dash
 *  distances — so the fold can re-stretch the P→p projector every tween frame
 *  without allocating new GPU buffers. */
function setSegment(line, x1, y1, z1, x2, y2, z2) {
  const geo = line.geometry;
  const posBuf = geo.attributes.instanceStart.data; // shared with instanceEnd
  const a = posBuf.array;
  a[0] = x1; a[1] = y1; a[2] = z1;
  a[3] = x2; a[4] = y2; a[5] = z2;
  posBuf.needsUpdate = true;
  const distBuf = geo.attributes.instanceDistanceStart.data; // shared with …End
  distBuf.array[0] = 0;
  distBuf.array[1] = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  distBuf.needsUpdate = true;
}

/** The point P marker: a crisp ink sphere over a faint paper halo. Both ride the
 *  renderer's transparent pass with depthTest off (halo renderOrder 2 < dot 3), so
 *  the marker separates cleanly from the translucent planes and linework — the
 *  legacy asp() treatment, see Module1/src/engine.js for the full rationale. */
function pointMarker(x, y, z, colour, paper) {
  const markers = [];
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(P_RADIUS * 1.55, 20, 14),
    new THREE.MeshBasicMaterial({
      color: paper, transparent: true, opacity: 0.9,
      depthTest: false, depthWrite: false,
    }),
  );
  halo.renderOrder = 2;
  halo.position.set(x, y, z);
  markers.push(halo);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(P_RADIUS, 24, 18),
    new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false,
    }),
  );
  dot.renderOrder = 3;
  dot.position.set(x, y, z);
  markers.push(dot);
  return markers;
}

/** A view mark: the textbook THICK FILLED DOT (ADR-016) — paper halo + plane-hued
 *  disc, oriented to lie IN its plane (`inHP` → flat in the floor's XZ; otherwise
 *  upright in the wall's XY). The legacy acr() treatment. */
function footDot(x, y, z, colour, paper, inHP) {
  const r = FOOT_RADIUS * 0.8;
  const rotX = inHP ? -Math.PI / 2 : 0;
  const markers = [];

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(r * 1.5, 24),
    new THREE.MeshBasicMaterial({
      color: paper, transparent: true, opacity: 0.9,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  halo.renderOrder = 2;
  halo.rotation.x = rotX;
  halo.position.set(x, y, z);
  markers.push(halo);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(r, 24),
    new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 1,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  disc.renderOrder = 3;
  disc.rotation.x = rotX;
  disc.position.set(x, y, z);
  markers.push(disc);
  return markers;
}

/**
 * Build the point rig: P, its projections, and the fold-riding top view.
 *
 * @param {Object} opts
 * @param {{x:number, y:number, z:number}} opts.position  P's WORLD position (the
 *   orchestrator remaps spatialData's resolved signed mm onto world axes:
 *   height → Y, depth in front of VP → Z, lateral → X).
 * @param {boolean} [opts.showProjections=false]  Draw p, p′ and the projectors
 *   (steps 3+); step 2 shows the bare point wandering the four rooms.
 * @param {number}  [opts.foldAngle=0]  Initial hinge angle (rad), so a rebuild
 *   mid-fold or in the folded state lands in pose.
 * @param {number}  [opts.width=1]      Viewport CSS px (LineMaterial.resolution).
 * @param {number}  [opts.height=1]
 * @returns {{ group: THREE.Group,
 *             setFoldAngle: (a: number) => void,
 *             setResolution: (w: number, h: number) => void,
 *             dispose: () => void }}
 */
export function createPointRig({
  position, showProjections = false,
  foldAngle = 0, width = 1, height = 1,
} = {}) {
  const paper = cssColor('--color-paper');
  const hpCol = cssColor('--color-hp-line');
  const vpCol = cssColor('--color-vp-line');
  const inkCol = cssColor('--color-ink');

  const group = new THREE.Group();
  const lineMats = [];
  const res = new THREE.Vector2(width, height);
  const { x: px, y: py, z: pz } = position;

  // The physical point P — stationary through the fold (only its shadow rides).
  pointMarker(px, py, pz, inkCol, paper).forEach((m) => group.add(m));

  /** The HP-riding pieces' hinge (mirrors the hvPlanes.js pivot). */
  const hpRiders = new THREE.Group();
  hpRiders.rotation.x = foldAngle;
  group.add(hpRiders);

  /** The dynamic dashed P→p projector — stretches as the foot rides the fold. */
  let hpProjector = null;

  /** Where the top-view foot sits once the hinge stands at angle `a`:
   *  (px, 0, pz) rotated about the X fold line → (px, −pz·sin a, pz·cos a). */
  const footAt = (a) => ({ y: -pz * Math.sin(a), z: pz * Math.cos(a) });

  if (showProjections) {
    // ── Front view p′ on VP — never moves during the fold. Amber linework:
    //    the DASHED 3D-space projector P→p′, then its SOLID in-plane connector to
    //    the fold line. NARROW curriculum-owner override: ONLY the on-VP connector
    //    is solid (echoing the SOLID amber VP sheet border in hvPlanes.js); the
    //    3D-space P→p′ projector stays dashed like its HP twin P→p (RULES.md §4.6 /
    //    §6.18). The dashed projector starts SPHERE_GAP off P so its dash begins at
    //    the sphere surface, not buried in P's marker.
    const vpStart = nudgeOffP(px, py, pz, px, py, 0);
    group.add(fatSegment(vpStart.x, vpStart.y, vpStart.z, px, py, 0, vpCol, true, res, lineMats));
    group.add(fatSegment(px, py, 0, px, 0, 0, vpCol, false, res, lineMats));
    footDot(px, py, 0, vpCol, paper, false).forEach((m) => group.add(m));

    // ── Top view p on HP — rides the folding floor. Teal + solid connector
    //    in-plane (the dashed projector below is the 3D pictorial cue).
    footDot(px, 0, pz, hpCol, paper, true).forEach((m) => hpRiders.add(m));
    hpRiders.add(fatSegment(px, 0, pz, px, 0, 0, hpCol, false, res, lineMats));

    // ── The dashed P→p projector — endpoints live in world space (P is fixed,
    //    the foot moves), so it sits OUTSIDE the hinge and re-stretches in place.
    //    Its start is likewise nudged SPHERE_GAP off P toward the (moving) foot.
    const foot = footAt(foldAngle);
    const hpStart = nudgeOffP(px, py, pz, px, foot.y, foot.z);
    hpProjector = fatSegment(hpStart.x, hpStart.y, hpStart.z, px, foot.y, foot.z, hpCol, true, res, lineMats);
    hpProjector.frustumCulled = false; // endpoints move; keep the stale bounds out of culling
    group.add(hpProjector);
  }

  // Every material this rig created, paired with its own target opacity, so the
  // orchestrator can dissolve the whole point (sphere + halos + view dots +
  // projectors) in/out on the 4↔5 cross-fade. Captured once here at build time.
  const fadeMats = [];
  group.traverse((obj) => {
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    for (const m of mats) fadeMats.push({ mat: m, base: m.opacity ?? 1 });
  });

  return {
    group,

    /** Drive the rabatment: rotate the riding top view with the floor and
     *  re-stretch the dashed projector to the moving foot. Pure transform +
     *  in-place buffer writes — safe every tween frame. */
    setFoldAngle(a) {
      hpRiders.rotation.x = a;
      if (hpProjector) {
        const foot = footAt(a);
        const s = nudgeOffP(px, py, pz, px, foot.y, foot.z); // keep the dash off P's surface
        setSegment(hpProjector, s.x, s.y, s.z, px, foot.y, foot.z);
      }
    },

    /** Dissolve the whole rig in/out: multiply every marker + projector opacity by
     *  `k` (0 = gone, 1 = the designed weights). Pure uniform writes — safe every
     *  tween frame. */
    setOpacity(k) {
      for (const { mat, base } of fadeMats) mat.opacity = base * k;
    },

    /** Keep every LineMaterial's resolution in sync with the viewport
     *  (RULES.md §3.16). */
    setResolution(w, h) {
      for (const m of lineMats) m.resolution.set(w, h);
    },

    /** Full disposal contract (ADR-004): free every geometry + material this
     *  builder created, then empty the group. */
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
