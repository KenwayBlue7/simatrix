// hvPlanes.js — the reference-plane pair (leaf module, ADR-007/ADR-033): the teal
// Horizontal Plane lying flat as the "floor" and the amber Vertical Plane standing
// up as the "wall", meeting in the XY fold line. The HP lives inside a pivot group
// hinged on that fold line, so the step-4 rabatment is a single rotation the
// orchestrator drives through setFoldAngle() — no rebuild mid-swing.
//
// World axes (engineering-correct, the Module-1 family convention — see
// Module1/CLAUDE.md §"3D scene conventions"):
//   HP = XZ plane (y = 0) · VP = XY plane (z = 0) · fold line = X axis
// Folding rotates the pivot 0 → +90° about X, which swings the front half of the
// floor (z > 0) DOWN into the wall's plane below the fold line — first angle.
//
// Visual language carried over from the legacy quadrants/firstangle lessons
// (Module1/quadrants.js drawStage): faint paper-tinted fills (0.10 HP / 0.07 VP),
// a denser plane-hued "cage" grid (opacity .55, hue faded .60 toward paper — so
// the sheets read as structure the Q3 frustum sits visibly inside), and crisp
// fat-line borders.
// ── Two-Cue override (user-ordered, 2026-07-04): the VP SHEET BORDER is drawn
// SOLID amber, not dashed — an explicit user override of the Two-Cue dash pairing
// (DESIGN.md §2.3) for the sheet border ONLY. VP *linework* elsewhere keeps its
// dash cue untouched (point.js: the P→p′ projector and its fold-line connector
// stay dashed amber). Deliberate, in the RULES.md §6.17/§6.18 spirit — do NOT
// "fix" this border back to dashed. The HP/VP text labels live in labelLayer.js.
//
// Layering (RULES.md §3.6): leaf module — imports three only, never a sibling leaf.
// main.js owns rebuild(); this builder is called from that one seam and hands back
// { group, setFoldAngle, setResolution, dispose } so the orchestrator can hinge the
// fold, keep LineMaterial.resolution in sync on resize (ADR-006), and honour the
// full disposal contract (ADR-004).

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ── Token access — colours come from CSS custom properties, never hard-coded
//    (RULES.md §4.1). Blends only mix existing tokens (no new palette colours).
const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());
const mixToward = (a, b, t) => a.clone().lerp(b, t);

// ── Sheet + stroke constants (legacy Module-1 values, world units / CSS px) ──
// SHEET is exported for main.js's held-angle fold framing (ADR-013): the flat-
// sheet bounding box the camera dollies to is sized from the same constant the
// sheets are built from, so the two can never drift.
export const SHEET = 9;          // full plane size (legacy S)
const HALF = SHEET / 2;
const LW = { edge: 2.6, border: 1.6 };          // fold line / plane borders (px)
const FILL = { hp: 0.10, vp: 0.07, mix: 0.72 }; // faint paper-tinted fills
// The "cage" grid. `divs` = grid lines across a FULL sheet (was cell:1 → 9 divs, calm;
// briefly packed to 48 for a very dense cage). Dialed back to 24 (2026-07-04) — the
// sheets still read as a structured cage the Q3 frustum sits visibly inside, but the
// line density no longer buzzes/moirés against the fat borders and chips. cell is
// derived from SHEET so half and full sheets keep identical spacing.
const GRID = { opacity: 0.55, fade: 0.60, divs: 24 };
const GRID_CELL = SHEET / GRID.divs;
const DASH = { dashSize: 0.20, gapSize: 0.13 };      // world-space dash sizing

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
  line.computeLineDistances();
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

/** The plane-hued grid: thin 1px native lines, hue faded toward paper. Tuned as a
 *  "cage" (GRID above — denser than the legacy calm treatment) so the sheets read
 *  as structure: the translucent lines overlay whatever sits behind the sheet, and
 *  the Q3 frustum shows visibly through them on step 5. Still under the fat
 *  linework. `map(u,v)` places a grid vertex on the plane, so the same generator
 *  serves HP (u,0,v) and VP (u,v,0) without any rotation gymnastics. */
function calmGrid(map, u0, u1, v0, v1, hue, paper) {
  const pos = [];
  const uSteps = Math.round((u1 - u0) / GRID_CELL);
  const vSteps = Math.round((v1 - v0) / GRID_CELL);
  for (let i = 0; i <= uSteps; i++) {
    const u = u0 + i * GRID_CELL;
    pos.push(...map(u, v0), ...map(u, v1));
  }
  for (let i = 0; i <= vSteps; i++) {
    const v = v0 + i * GRID_CELL;
    pos.push(...map(u0, v), ...map(u1, v));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: mixToward(hue, paper, GRID.fade),
    transparent: true, opacity: GRID.opacity, depthWrite: false,
  });
  const grid = new THREE.LineSegments(geo, mat);
  grid.renderOrder = -1; // above the fill (-2), under every stroke (0+)
  return grid;
}

/**
 * Build the HP/VP plane pair.
 *
 * @param {Object} opts
 * @param {boolean} [opts.showHP=true]   Draw the Horizontal Plane (teal floor).
 * @param {boolean} [opts.showVP=true]   Draw the Vertical Plane (amber wall).
 * @param {boolean} [opts.extended=false] Step-2 "four rooms" RESTING state. The
 *   beyond-fold EXTENSION geometry (the sheet halves past the fold line) is ALWAYS
 *   built now; this flag only seeds its initial opacity (1 = four rooms, 0 = the
 *   step-1 room corner). The orchestrator then animates it through
 *   setExtendedOpacity(), so a grow/shrink fades ONLY the extension and never
 *   re-fades or double-draws the shared room-corner (Quadrant I).
 * @param {number}  [opts.foldAngle=0]   Initial hinge angle in radians (0 = open
 *   3D corner, +π/2 = folded flat) — so a rebuild mid-fold lands in pose.
 * @param {number}  [opts.width=1]       Viewport CSS px (LineMaterial.resolution).
 * @param {number}  [opts.height=1]
 * @returns {{ group: THREE.Group,
 *             setFoldAngle: (a: number) => void,
 *             setResolution: (w: number, h: number) => void,
 *             dispose: () => void }}
 */
export function createHvPlanes({
  showHP = true, showVP = true, extended = false,
  foldAngle = 0, width = 1, height = 1,
} = {}) {
  const paper = cssColor('--color-paper');
  const hpCol = cssColor('--color-hp-line');
  const vpCol = cssColor('--color-vp-line');
  const inkCol = cssColor('--color-ink');

  const group = new THREE.Group();
  const lineMats = [];
  // Two fade buckets so the four-rooms EXTENSION (the sheet halves past the fold line)
  // fades in/out INDEPENDENTLY of the always-present room-corner CORE. A grow/shrink
  // then only animates the extension: the shared Quadrant-I corner never re-fades or
  // double-draws, so there is no steal-to-graveyard for planes and no outgoing leaf to
  // Z-fight the incoming one. Each entry pairs a material with its DESIGNED opacity; the
  // live weight is
  //   coreMats : base · leafK          (leafK = the whole-sheet intro fade)
  //   extMats  : base · leafK · extK   (extK  = the four-rooms grow/shrink fade)
  const coreMats = [];
  const extMats = [];
  const res = new THREE.Vector2(width, height);

  /** Faint sheet fill — pale plane-hue tint toward paper, so two overlapping
   *  translucent sheets never multiply into a muddy smudge (legacy apl()). Its material
   *  registers in `bucket` (coreMats / extMats) so the right fade drives it. */
  const sheetFill = (w, h, hue, opacity, bucket) => {
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: mixToward(hue, paper, FILL.mix),
        transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    fill.renderOrder = -2; // under the grid (-1) and all strokes
    bucket.push({ mat: fill.material, base: opacity });
    return fill;
  };

  /** A cage grid over [u0,u1]×[v0,v1]; its material registers in `bucket` for the fade. */
  const gridInto = (bucket, map, u0, u1, v0, v1, hue) => {
    const grid = calmGrid(map, u0, u1, v0, v1, hue, paper);
    bucket.push({ mat: grid.material, base: GRID.opacity });
    return grid;
  };

  /** A fat-line stroke: registers with lineMats (resolution sync on resize) AND with
   *  `bucket` (fade, base opacity 1). `width` defaults to a plane border; the ink fold
   *  line passes LW.edge. Never dashed here — VP's SOLID border is a standing override. */
  const stroke = (flat, colour, bucket, width = LW.border) => {
    const line = fatSegments(flat, colour, width, false, res, lineMats);
    bucket.push({ mat: line.material, base: 1 });
    return line;
  };

  // ── VP — the amber wall in the XY plane (z = 0). Stationary through the fold.
  //    SOLID border by explicit user override of the Two-Cue dash pairing
  //    (DESIGN.md §2.3) — sheet border only; see the header note. Do not re-dash.
  if (showVP) {
    // Core: the wall ABOVE the fold line (y ∈ [0, HALF]) — the step-1 half sheet.
    const cFill = sheetFill(SHEET, HALF, vpCol, FILL.vp, coreMats);
    cFill.position.set(0, HALF / 2, 0);
    group.add(cFill);
    group.add(gridInto(coreMats, (u, v) => [u, v, 0], -HALF, HALF, 0, HALF, vpCol));
    group.add(stroke(
      loopFlat([[-HALF, 0, 0], [HALF, 0, 0], [HALF, HALF, 0], [-HALF, HALF, 0]]),
      vpCol, coreMats));
    // Extension: the wall BELOW the fold line (y ∈ [−HALF, 0]) — the four-rooms growth.
    const eFill = sheetFill(SHEET, HALF, vpCol, FILL.vp, extMats);
    eFill.position.set(0, -HALF / 2, 0);
    group.add(eFill);
    group.add(gridInto(extMats, (u, v) => [u, v, 0], -HALF, HALF, -HALF, 0, vpCol));
    // Bottom edge + the two lower sides — with the core border they close the full square.
    group.add(stroke([
      -HALF, -HALF, 0, HALF, -HALF, 0,
      -HALF, -HALF, 0, -HALF, 0, 0,
      HALF, -HALF, 0, HALF, 0, 0,
    ], vpCol, extMats));
  }

  // ── HP — the teal floor in the XZ plane (y = 0), everything inside the fold
  //    pivot hinged on the X axis. Solid border = the Two-Cue pairing for HP.
  const hpPivot = new THREE.Group();
  hpPivot.rotation.x = foldAngle;
  group.add(hpPivot);
  if (showHP) {
    // Core: the floor IN FRONT of the wall (z ∈ [0, HALF]) — the step-1 half sheet.
    const cFill = sheetFill(SHEET, HALF, hpCol, FILL.hp, coreMats);
    cFill.rotation.x = -Math.PI / 2; // local XY → world XZ
    cFill.position.set(0, 0, HALF / 2);
    hpPivot.add(cFill);
    hpPivot.add(gridInto(coreMats, (u, v) => [u, 0, v], -HALF, HALF, 0, HALF, hpCol));
    hpPivot.add(stroke(
      loopFlat([[-HALF, 0, 0], [HALF, 0, 0], [HALF, 0, HALF], [-HALF, 0, HALF]]),
      hpCol, coreMats));
    // Extension: the floor BEHIND the wall (z ∈ [−HALF, 0]) — the four-rooms growth.
    const eFill = sheetFill(SHEET, HALF, hpCol, FILL.hp, extMats);
    eFill.rotation.x = -Math.PI / 2;
    eFill.position.set(0, 0, -HALF / 2);
    hpPivot.add(eFill);
    hpPivot.add(gridInto(extMats, (u, v) => [u, 0, v], -HALF, HALF, -HALF, 0, hpCol));
    hpPivot.add(stroke([
      -HALF, 0, -HALF, HALF, 0, -HALF,
      -HALF, 0, -HALF, -HALF, 0, 0,
      HALF, 0, -HALF, HALF, 0, 0,
    ], hpCol, extMats));
  }

  // ── The fold line (XY) — the hinge itself. Ink, on top of both borders where
  //    they coincide (added last → drawn last within the transparent pass).
  group.add(stroke([-HALF, 0, 0, HALF, 0, 0], inkCol, coreMats, LW.edge));

  // ── Opacity model — two composable fades (see the coreMats/extMats note above).
  //    coreMats stay at base·leafK; extMats at base·leafK·extK, so the whole-sheet
  //    intro fade and the four-rooms grow/shrink fade never clobber each other no
  //    matter which order the tweens write in a frame.
  let leafK = 1;                // whole-sheet intro fade (boot / first appearance)
  let extK = extended ? 1 : 0;  // four-rooms extension grow/shrink fade (resting seed)
  const stampOpacities = () => {
    for (const { mat, base } of coreMats) mat.opacity = base * leafK;
    for (const { mat, base } of extMats) mat.opacity = base * leafK * extK;
  };
  stampOpacities();

  return {
    group,

    /** The rabatment hinge: 0 (open 3D corner) → +π/2 (flat first-angle sheet).
     *  Pure transform — no geometry churn, safe to drive every tween frame. */
    setFoldAngle(a) {
      hpPivot.rotation.x = a;
    },

    /** Whole-sheet fade (boot / first appearance): scale EVERY material — core and
     *  extension alike — by `k` (0 = invisible, 1 = the designed weights). Composes
     *  with the extension fade. Pure uniform writes — safe every tween frame. */
    setOpacity(k) {
      leafK = k;
      stampOpacities();
    },

    /** Four-rooms fade: scale ONLY the beyond-fold extension by `k` (1 = four rooms,
     *  0 = the room corner). The shared corner is untouched, so a grow/shrink never
     *  re-fades or double-draws it (Tasks 1 + 2). Composes with the whole-sheet fade. */
    setExtendedOpacity(k) {
      extK = k;
      stampOpacities();
    },

    /** Keep every LineMaterial's resolution in sync with the viewport, or the fat
     *  lines render the wrong thickness after a resize (RULES.md §3.16). */
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
