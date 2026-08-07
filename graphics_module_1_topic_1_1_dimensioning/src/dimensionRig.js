// The subject of the lesson (Module 1 Topic 1.1 — Dimensioning): ONE figure's solid and its
// BIS line-alphabet linework.
//
// WHICH figure is an argument, not a decision this file makes. The lesson runs through five of
// them, simplest first (see `FIGURES` in dimensionData.js), and every one is built by the code
// below from the same three inputs — an outline, a feature map and a thickness. That is what
// keeps a plain plate and the Guide Plate looking like the same drawing office drew them: one
// set of line widths, one dash pattern, one chain pattern, one corner threshold. A figure that
// has no slot simply never enters the slot branch; nothing is special-cased by figure id.
//
// This layer answers "what is the part?" — nothing about dimensions lives here. It builds:
//   • the SOLID — one closed, manifold, hard-edged mesh generated from dimensionData's
//     outline + feature loops (RULES.md §3.14 non-indexed hard edges, §3.29 manifold, no
//     overlapping or duplicated extrusions). The countersink and the spherical seat are
//     REAL geometry, not drawn-on circles, so orbiting the part never exposes a lie.
//   • TYPE A linework — continuous wide: the visible outline + every feature opening on the
//     front and back faces, plus the vertical corner edges of the prism.
//   • TYPE E/F linework — dashed narrow: the genuinely hidden outline of a front elevation,
//     which on both figures that have one is a countersink sunk in the FAR face. Rule 5 of the
//     textbook's §4.6 ("dimensions are to be given from visible outlines rather than from
//     hidden lines") needs a real hidden line to argue against, so those figures are designed
//     to have exactly one and no more.
//   • TYPE G linework — chain thin: the centre lines of every circular / symmetrical feature.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. It imports THREE, the fat-line addons,
// and `dimensionData.js` — this topic's single PURE-DATA module, the sibling-importable
// exception in the same spirit as `genericSolid.js` (see ADR-133). It never imports another
// behavioural leaf, and never main.js.
//
// FAT LINES (RULES.md §3.12–§3.13, §3.16–§3.17): every stroke is LineSegments2 +
// LineMaterial; the dashed batch calls computeLineDistances() and carries the §3.18a
// polygonOffset + renderOrder bias so a coincident visible line always wins.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import {
  DEFAULT_FIGURE, halfDepthOf, outlinePoints, featurePoints, toWorld, toUnits,
} from './dimensionData.js';

const rootStyle = getComputedStyle(document.documentElement);
/** Resolve a CSS custom property to a THREE.Color — never a hard-coded hex (RULES.md §4.1). */
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

/**
 * Line widths in CSS pixels, and the dash/chain patterns, mapping the line alphabet onto the
 * screen. THESE ARE THE SIBLING FOUNDATIONS TOPIC'S NUMBERS, deliberately identical: the same
 * dashed countersink is drawn by THIS file in the elevation and by `lineDrawer.js` the moment
 * the part is turned, and a learner must not be able to tell the two apart. Foundations is the
 * reviewed benchmark, so its constants are the ones both sides use (ADR-136).
 */
const WIDTH_PX = Object.freeze({
  visible: 2.5, // Type A — continuous wide
  hidden: 1.5,  // Type E/F — dashed narrow
  centre: 1.3,  // Type G — chain thin
});

/** Type E/F dash pattern in world units — identical to lineDrawer.js and to Foundations. */
const DASH = Object.freeze({ size: 0.12, gap: 0.08 });

/** Type G chain pattern in world units: long dash · gap · dot · gap. */
const CHAIN = Object.freeze({ long: 0.34, dot: 0.07, gap: 0.12 });

/** How far a centre line runs past the feature it marks (world units). */
const CENTRE_OVERSHOOT = 0.35;

/** Turn angle (degrees) above which an outline point counts as a real CORNER and earns a
 *  vertical edge line. Arc tessellation points fall well below it, so a fillet does not
 *  sprout a comb of edges. */
const CORNER_DEG = 12;

/** Segments used to tessellate a full circle in the solid + its linework. */
const CIRCLE_STEPS = 64;

/** Rings down the spherical seat's bowl (rim → pole). */
const SPHERE_RINGS = 12;

// ============================================================================
// Small geometry helpers
// ============================================================================

/** mm loop → world-unit loop of {x,y}, centred on the origin. */
const toWorldLoop = (pts) => pts.map((p) => toWorld(p.x, p.y));

/** Reverse a loop's winding (CCW ↔ CW). Holes are fed to the triangulator CW. */
const reversed = (loop) => loop.slice().reverse();

/** Uniformly scale a loop about a centre — used for the countersink's two radii. */
function circleLoop(centreMm, radiusMm, steps = CIRCLE_STEPS) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push(toWorld(centreMm[0] + Math.cos(a) * radiusMm, centreMm[1] + Math.sin(a) * radiusMm));
  }
  return out;
}

/** Append one triangle (three {x,y} + z pairs are pre-resolved to Vector3-ish) to a flat array. */
function pushTri(out, a, b, c) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

/**
 * Append the side wall between two same-length loops at two depths. `loopA` sits at the
 * GREATER z (nearer the viewer) and `loopB` at the lesser, which fixes the winding so the
 * generated normals point out of the material for an anticlockwise outer contour and into
 * the void for a clockwise hole.
 */
function pushWall(out, loopA, zA, loopB, zB) {
  const n = loopA.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = { x: loopA[i].x, y: loopA[i].y, z: zA };
    const a1 = { x: loopA[j].x, y: loopA[j].y, z: zA };
    const b0 = { x: loopB[i].x, y: loopB[i].y, z: zB };
    const b1 = { x: loopB[j].x, y: loopB[j].y, z: zB };
    pushTri(out, a0, b0, b1);
    pushTri(out, a0, b1, a1);
  }
}

/** Append a cap's triangles from a triangulation over the concatenated loop vertex list. */
function pushCap(out, verts, faces, z, flip) {
  for (const [i, j, k] of faces) {
    const a = { x: verts[i].x, y: verts[i].y, z };
    const b = { x: verts[j].x, y: verts[j].y, z };
    const c = { x: verts[k].x, y: verts[k].y, z };
    if (flip) pushTri(out, a, c, b); else pushTri(out, a, b, c);
  }
}

/** Append a closed polyline (world {x,y}) at depth z as disjoint segments. */
function pushLoop(out, loop, z) {
  for (let i = 0; i < loop.length; i++) {
    const j = (i + 1) % loop.length;
    out.push(loop[i].x, loop[i].y, z, loop[j].x, loop[j].y, z);
  }
}

/** Append a chain (long-dash · dot) line between two world points — the Type G pattern.
 *  Authored as real breaks, because a LineMaterial dash has a single period only. */
function pushChain(out, ax, ay, bx, by, z) {
  const total = Math.hypot(bx - ax, by - ay);
  if (total < 1e-4) return;
  const ux = (bx - ax) / total;
  const uy = (by - ay) / total;
  const steps = [
    { len: CHAIN.long, draw: true },
    { len: CHAIN.gap, draw: false },
    { len: CHAIN.dot, draw: true },
    { len: CHAIN.gap, draw: false },
  ];
  let d = 0;
  let i = 0;
  while (d < total) {
    const step = steps[i % steps.length];
    const end = Math.min(d + step.len, total);
    if (step.draw) {
      out.push(ax + ux * d, ay + uy * d, z, ax + ux * end, ay + uy * end, z);
    }
    d = end;
    i += 1;
  }
}

/** Build one fat-line object, or null for an empty batch. */
function buildLines(positions, color, widthPx, resolution, { dashed = false } = {}) {
  if (positions.length === 0) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color: color.getHex(),
    linewidth: widthPx,
    dashed,
    dashSize: DASH.size,
    gapSize: DASH.gap,
  });
  material.resolution.copy(resolution);
  if (dashed) {
    // RULES.md §3.18a — a coincident visible line must always win over a hidden dashed one.
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    // A hidden line is hidden BY DEFINITION: it lies behind solid material, so the depth
    // buffer would erase it and the drawing would silently lose the one dashed outline the
    // "dimension from visible outlines" rule argues about. A drawing shows it anyway, which
    // is what depthTest:false does here. The RENDER ORDER below then keeps §3.18a's
    // precedence intact: solid (0) → hidden dashed (1) → visible wide (2) → the dimension
    // apparatus (3), so a coincident visible line still paints over a hidden one.
    material.depthTest = false;
  }
  const lines = new LineSegments2(geometry, material);
  if (dashed) lines.computeLineDistances(); // RULES.md §3.17 — else it renders solid
  lines.renderOrder = dashed ? 1 : 2;
  lines.frustumCulled = false;
  return lines;
}

// ============================================================================
// Public factory
// ============================================================================

/**
 * Build one figure's rig: the solid + its Type A / E-F / G linework.
 *
 * @param {Object} [options]
 * @param {object} [options.figure]   Which figure (see `FIGURES` in dimensionData.js).
 * @param {number} [options.width=1]  Drawing-buffer width  (LineMaterial.resolution)
 * @param {number} [options.height=1] Drawing-buffer height
 * @returns {{
 *   group: THREE.Group,
 *   mesh: THREE.Mesh,
 *   setSolidVisible: (on: boolean) => void,
 *   setOutlineVisible: (on: boolean) => void,
 *   setHiddenVisible: (on: boolean) => void,
 *   setCentreLinesVisible: (on: boolean) => void,
 *   setDimmed: (on: boolean) => void,
 *   setViewMode: (mode: 'front'|'rear'|'free') => void,
 *   setAuthoredVisible: (on: boolean) => void,
 *   setLineFocus: (id: 'visible'|'hidden'|'centre'|null) => void,
 *   applyState: (state: object) => void,
 *   setResolution: (w: number, h: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createRig(options = {}) {
  const { figure = DEFAULT_FIGURE, width = 1, height = 1 } = options;
  const resolution = new THREE.Vector2(width, height);

  const zF = halfDepthOf(figure);   // front face
  const zB = -zF;                   // back face

  // --- Loops -----------------------------------------------------------------
  const contour = toWorldLoop(outlinePoints(figure));

  /**
   * Openings punched through the FRONT cap and through the BACK cap, as separate lists.
   *
   * A feature machined from one side only appears in ONE of them, and that asymmetry is the
   * whole reason the drawing has hidden detail at all: a countersink opened in the back face
   * pierces the back cap and not the front, so from the front it lies behind solid material
   * and is drawn dashed. Both figures that carry one are built by exactly this code.
   */
  const frontHoles = [];
  const backHoles = [];
  /** Wall builders, deferred so every cap can be triangulated before any wall is pushed. */
  const wallJobs = [];
  const visiblePos = [];     // Type A — continuous wide
  const farSidePos = [];     // detail on the FAR face: dashed from the front, continuous turned over
  const silhouettePos = [];  // lines that are edges in the elevation only (see below)
  const centrePos = [];      // Type G — chain thin

  /** A centre cross over one round or symmetrical feature. */
  const chainCross = (atMm, halfMm) => {
    const c = toWorld(atMm[0], atMm[1]);
    const h = toUnits(halfMm) + CENTRE_OVERSHOOT;
    pushChain(centrePos, c.x - h, c.y, c.x + h, c.y, zF);
    pushChain(centrePos, c.x, c.y - h, c.x, c.y + h, zF);
  };

  for (const f of Object.values(figure.features || {})) {
    // ---- a drilled or bored hole, in any of its three forms --------------------
    if (f.kind === 'circle') {
      const loop = toWorldLoop(featurePoints(f, CIRCLE_STEPS));

      if (f.chamfer) {
        // An internal chamfer at the FRONT mouth (Fig. 4.26c): the hole opens out at the face
        // and drops back at 45° to its full depth, so it reads as TWO concentric circles.
        const mouthDia = f.dia + f.chamfer.width * 2;
        const mouthLoop = circleLoop(f.at, mouthDia / 2);
        const drop = toUnits(f.chamfer.width);   // 45° ⇒ axial drop = radial step
        frontHoles.push(reversed(mouthLoop));
        backHoles.push(reversed(loop));
        wallJobs.push((tris) => {
          pushWall(tris, reversed(mouthLoop), zF, reversed(loop), zF - drop);
          pushWall(tris, reversed(loop), zF - drop, reversed(loop), zB);
        });
        pushLoop(visiblePos, mouthLoop, zF);
        pushLoop(visiblePos, loop, zF - drop);
        pushLoop(visiblePos, loop, zB);
        chainCross(f.at, mouthDia / 2);
        continue;
      }

      if (f.countersink) {
        // A cone widening the mouth on ONE face. Depth comes from the included angle: a 90°
        // cone has 45° flanks, so the axial drop equals the radial step (Fig. 4.27).
        const cs = f.countersink;
        const cskLoop = circleLoop(f.at, cs.dia / 2);
        const cskDepth = toUnits(
          (cs.dia - f.dia) / 2 / Math.tan((cs.angle / 2) * Math.PI / 180),
        );
        const onBack = cs.side !== 'front';
        frontHoles.push(reversed(onBack ? loop : cskLoop));
        backHoles.push(reversed(onBack ? cskLoop : loop));
        wallJobs.push((tris) => {
          const drill = reversed(loop);
          const csk = reversed(cskLoop);
          if (onBack) {
            pushWall(tris, drill, zF, drill, zB + cskDepth);
            pushWall(tris, drill, zB + cskDepth, csk, zB);
          } else {
            pushWall(tris, csk, zF, drill, zF - cskDepth);
            pushWall(tris, drill, zF - cskDepth, drill, zB);
          }
        });
        if (onBack) {
          // The drill is what you see from the front; the cone is what you do not. The two
          // circles of the cone go in their own batch so the "Turn over" chip can swap them
          // from dashed to continuous — if they did not change, that chip would be lying.
          pushLoop(visiblePos, loop, zF);
          pushLoop(farSidePos, cskLoop, zB);
          pushLoop(farSidePos, loop, zB + cskDepth);
        } else {
          pushLoop(visiblePos, cskLoop, zF);
          pushLoop(visiblePos, loop, zF - cskDepth);
          pushLoop(visiblePos, loop, zB);
        }
        chainCross(f.at, cs.dia / 2);
        continue;
      }

      // A plain through hole.
      frontHoles.push(reversed(loop));
      backHoles.push(reversed(loop));
      wallJobs.push((tris) => pushWall(tris, reversed(loop), zF, reversed(loop), zB));
      pushLoop(visiblePos, loop, zF);
      pushLoop(visiblePos, loop, zB);
      chainCross(f.at, f.dia / 2);
      continue;
    }

    // ---- a square hole, and a slot: both straight through ----------------------
    if (f.kind === 'square' || f.kind === 'slot') {
      const loop = toWorldLoop(featurePoints(f, CIRCLE_STEPS));
      frontHoles.push(reversed(loop));
      backHoles.push(reversed(loop));
      wallJobs.push((tris) => pushWall(tris, reversed(loop), zF, reversed(loop), zB));
      pushLoop(visiblePos, loop, zF);
      pushLoop(visiblePos, loop, zB);
      if (f.kind === 'square') {
        chainCross(f.at, f.side / 2);
      } else {
        // The slot gets one axis through both centres plus a cross at each end.
        const [a, b] = f.centres;
        const wa = toWorld(a[0], a[1]);
        const wb = toWorld(b[0], b[1]);
        const h = toUnits(f.width / 2) + CENTRE_OVERSHOOT;
        pushChain(centrePos, wa.x - h, wa.y, wb.x + h, wb.y, zF);
        pushChain(centrePos, wa.x, wa.y - h, wa.x, wa.y + h, zF);
        pushChain(centrePos, wb.x, wb.y - h, wb.x, wb.y + h, zF);
      }
      continue;
    }

    // ---- a spherical seat: a blind bowl sunk into the FRONT face ---------------
    if (f.kind === 'sphere') {
      const rim = circleLoop(f.at, f.dia / 2);
      frontHoles.push(reversed(rim));   // …and NOT the back cap: the bowl is blind
      wallJobs.push((tris) => {
        // Rings from the rim down to a small ring, then a triangle fan onto the pole — so
        // there is never a zero-area triangle at the bottom (RULES.md §3.30).
        const R = toUnits(f.radius);
        const c = toWorld(f.at[0], f.at[1]);
        const ringAt = (theta) => {
          const r = R * Math.sin(theta);
          const n = rim.length;
          const ring = [];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            ring.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
          }
          return ring;
        };
        const zAt = (theta) => zF - R * Math.cos(theta);
        let prevTheta = Math.PI / 2;
        let prevLoop = reversed(ringAt(prevTheta));
        for (let k = 1; k <= SPHERE_RINGS; k++) {
          const theta = (Math.PI / 2) * (1 - k / SPHERE_RINGS);
          if (k === SPHERE_RINGS) {
            const pole = { x: c.x, y: c.y, z: zAt(0) };
            for (let i = 0; i < prevLoop.length; i++) {
              const j = (i + 1) % prevLoop.length;
              pushTri(
                tris,
                { x: prevLoop[i].x, y: prevLoop[i].y, z: zAt(prevTheta) },
                pole,
                { x: prevLoop[j].x, y: prevLoop[j].y, z: zAt(prevTheta) },
              );
            }
            break;
          }
          const loop = reversed(ringAt(theta));
          pushWall(tris, prevLoop, zAt(prevTheta), loop, zAt(theta));
          prevLoop = loop;
          prevTheta = theta;
        }
      });
      pushLoop(visiblePos, rim, zF);
      chainCross(f.at, f.dia / 2);
      continue;
    }

    // ---- a cylindrical spigot standing off the RIGHT end face ------------------
    // Its axis lies IN the drawing plane, so the front elevation shows it as a RECTANGLE
    // (textbook Fig. 4.21). Its base is sunk 1 mm INTO the plate so no face of the spigot is
    // coincident with the plate's end wall (RULES.md §3.29 — coincident faces z-fight and are
    // not manifold).
    if (f.kind === 'cylinderX') {
      const r = toUnits(f.dia / 2);
      const cy = toWorld(0, f.at[1]).y;
      const x0 = toWorld(f.at[0] - 1, 0).x;               // 1 mm embedded
      const x1 = toWorld(f.at[0] + f.length, 0).x;
      const faceX = toWorld(f.at[0], 0).x;                // where it breaks the plate's face
      wallJobs.push((tris) => {
        const ring = (x) => {
          const out = [];
          for (let i = 0; i < CIRCLE_STEPS; i++) {
            const a = (i / CIRCLE_STEPS) * Math.PI * 2;
            out.push({ x, y: cy + Math.cos(a) * r, z: Math.sin(a) * r });
          }
          return out;
        };
        const a = ring(x0);
        const b = ring(x1);
        for (let i = 0; i < CIRCLE_STEPS; i++) {
          const j = (i + 1) % CIRCLE_STEPS;
          // Wound so the generated normal points OUT of the cylinder. `ring()` walks θ
          // anticlockwise in the (y, z) plane with the axis along +x, which is the opposite
          // hand to pushWall's z-ordered convention — so the obvious winding here comes out
          // inside-out. That is not cosmetic: an inward normal makes lineDrawer's sample bias
          // push the silhouette's probe point INTO the metal, and the two long edges of the
          // cylinder then classify as hidden from every direction.
          pushTri(tris, a[i], b[j], b[i]);
          pushTri(tris, a[i], a[j], b[j]);
        }
        // Free end cap (a fan), and a base cap so the solid stays closed.
        const capB = { x: x1, y: cy, z: 0 };
        const capA = { x: x0, y: cy, z: 0 };
        for (let i = 0; i < CIRCLE_STEPS; i++) {
          const j = (i + 1) % CIRCLE_STEPS;
          pushTri(tris, capB, b[i], b[j]);
          pushTri(tris, capA, a[j], a[i]);
        }
      });
      // Its free end circle, which projects to the end line of the rectangle in the front view.
      for (let i = 0; i < CIRCLE_STEPS; i++) {
        const a0 = (i / CIRCLE_STEPS) * Math.PI * 2;
        const a1 = ((i + 1) / CIRCLE_STEPS) * Math.PI * 2;
        visiblePos.push(
          x1, cy + Math.cos(a0) * r, Math.sin(a0) * r,
          x1, cy + Math.cos(a1) * r, Math.sin(a1) * r,
        );
      }
      // A cylinder has no edge along its length: those two lines are its SILHOUETTE, and a
      // silhouette belongs to one direction of sight. Looking along the plate's axis they are
      // exactly the long sides of the rectangle it projects to, and the drawing needs them.
      // Swung into the pictorial they become a crease down a smooth surface, so they come off.
      // That is a named-POSE switch, not per-edge classification — nothing is recomputed on
      // orbit, so ADR-133 stands.
      for (const s of [1, -1]) {
        silhouettePos.push(faceX, cy + s * r, 0, x1, cy + s * r, 0);
      }
      // Its axis runs ALONG the rectangle — the giveaway that the rectangle is a cylinder.
      pushChain(centrePos, faceX - CENTRE_OVERSHOOT, cy, x1 + CENTRE_OVERSHOOT, cy, 0);
      continue;
    }
  }

  // --- Solid -----------------------------------------------------------------
  const toVec2 = (loop) => loop.map((p) => new THREE.Vector2(p.x, p.y));
  const frontVerts = [contour, ...frontHoles].flat();
  const backVerts = [contour, ...backHoles].flat();
  const frontFaces = THREE.ShapeUtils.triangulateShape(toVec2(contour), frontHoles.map(toVec2));
  const backFaces = THREE.ShapeUtils.triangulateShape(toVec2(contour), backHoles.map(toVec2));

  const tris = [];
  pushCap(tris, frontVerts, frontFaces, zF, false); // faces +Z
  pushCap(tris, backVerts, backFaces, zB, true);    // faces −Z
  pushWall(tris, contour, zF, contour, zB);         // the outer wall
  for (const job of wallJobs) job(tris);            // …and every feature's own

  const geometry = new THREE.BufferGeometry(); // non-indexed, hard edges (RULES.md §3.14)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    color: cssColor('--color-solid-fill'),
    shininess: 0,        // flat CAD look, no PBR (RULES.md §3.24)
    flatShading: true,
    polygonOffset: true, // edges never z-fight the faces (RULES.md §3.18)
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    // OPAQUE by default, and deliberately so: a transparent material is drawn in Three.js's
    // LATE transparent pass, after every opaque object, which would let the solid paint over
    // the depth-test-free hidden linework. `setDimmed` flips it only while the part has to
    // step back behind a dimension study.
    transparent: false,
    opacity: 1,
    // FrontSide, exactly as the sibling Foundations topic. Every loop in this file is wound so
    // its normal points out of the material, so back-face culling is safe — and it is what the
    // occlusion raycaster in lineDrawer.js was reviewed against, since THREE's raycast honours
    // `side`. DoubleSide would also light the inside of the bore, the countersink cone and the
    // spherical seat with a flipped normal, which reads as a convex dome instead of a bowl.
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = figure.name;

  // --- Type A — continuous wide (visible outlines) ----------------------------
  // Every feature has already contributed its own circles above; what is left is the outline
  // itself, front and back, and the vertical edges of the prism between them.
  pushLoop(visiblePos, contour, zF);
  pushLoop(visiblePos, contour, zB);
  // Vertical corner edges — only at genuine corners, so a fillet or a corner radius stays
  // smooth instead of sprouting one edge per tessellation point.
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i];
    const prev = contour[(i - 1 + contour.length) % contour.length];
    const next = contour[(i + 1) % contour.length];
    const a0 = Math.atan2(p.y - prev.y, p.x - prev.x);
    const a1 = Math.atan2(next.y - p.y, next.x - p.x);
    let turn = a1 - a0;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) * 180 / Math.PI >= CORNER_DEG) visiblePos.push(p.x, p.y, zF, p.x, p.y, zB);
  }

  // --- Type E/F — dashed narrow -------------------------------------------------
  // Nothing else on any figure is ever hidden: the one genuinely hidden outline a front
  // elevation carries is a feature machined in the FAR face, and that lives in `farSidePos`
  // above so the "Turn over" chip can swap it from dashed to continuous. This batch stays
  // empty, and `buildLines` returns null for it.
  const hiddenPos = [];

  const inkColor = cssColor('--color-ink');
  const hiddenColor = cssColor('--color-bench-grey');
  const centreColor = cssColor('--color-ink-secondary');

  const outline = buildLines(visiblePos, inkColor, WIDTH_PX.visible, resolution);
  const silhouette = buildLines(silhouettePos, inkColor, WIDTH_PX.visible, resolution);
  const farHidden = buildLines(farSidePos, hiddenColor, WIDTH_PX.hidden, resolution, { dashed: true });
  const farVisible = buildLines(farSidePos, inkColor, WIDTH_PX.visible, resolution);
  const hidden = buildLines(hiddenPos, hiddenColor, WIDTH_PX.hidden, resolution, { dashed: true });
  const centre = buildLines(centrePos, centreColor, WIDTH_PX.centre, resolution);

  const group = new THREE.Group();
  group.name = `${figure.name} rig`;
  group.add(mesh);
  for (const l of [outline, silhouette, hidden, farHidden, farVisible]) if (l) group.add(l);
  if (centre) { centre.visible = false; group.add(centre); }
  if (farVisible) farVisible.visible = false; // the elevation starts on the front face

  const lineBatches = [outline, silhouette, hidden, farHidden, farVisible, centre].filter(Boolean);
  const baseWidth = new Map(lineBatches.map((l) => [l, l.material.linewidth]));
  // A line type groups every batch drawn at that weight, so Step 1's legend can hold one and
  // fade the rest without knowing which batches happen to exist.
  const byLineType = {
    visible: [outline, silhouette, farVisible],
    hidden: [hidden, farHidden],
    centre: [centre],
  };
  /** Whether the lesson wants centre lines on, independent of any line-type focus. */
  let centreWanted = false;
  /** Which named pose is live: an axial elevation, or a free/pictorial direction. */
  let viewMode = 'front';
  /**
   * Whether the AUTHORED linework is the one on show. It is, in the elevation — a drawing is
   * a fixed agreed projection. In the 3-D inspection `lineDrawer.js` classifies the same
   * solid live against the camera instead, and this whole authored set steps aside so the
   * two never double up (ADR-136).
   */
  let authoredWanted = true;
  /** Whether the lesson wants the part pushed into the background behind a dimension study. */
  let dimmedWanted = false;
  /** Which line type Step 1's legend is holding, or null. */
  let focusWanted = null;

  /**
   * Push the two LESSON-level material wants — the study dim and the line-type focus — onto
   * the solid and the authored batches.
   *
   * Both are affordances of the flat DRAWING: they exist so a dimension study reads on top of
   * the part. They are suppressed the moment the linework is handed to the live classifier,
   * because a translucent solid in a 3-D inspection is not a softer version of the right
   * picture, it is the wrong one: Three.js draws a transparent mesh in the LATE transparent
   * pass, after every opaque object, so it paints over the classifier's strokes, and its far
   * faces show through as ghost surfaces the part does not have. The wants are held, not
   * dropped — returning to the elevation restores the study exactly as the learner left it.
   */
  function applyMaterialState() {
    const study = authoredWanted;                 // a study only makes sense on the drawing
    const dim = study && dimmedWanted;
    const focus = study ? focusWanted : null;

    // A centre line cannot be studied while it is switched off.
    if (centre) centre.visible = focus === 'centre' ? true : centreWanted;

    const held = new Set(focus ? (byLineType[focus] || []).filter(Boolean) : []);
    for (const line of lineBatches) {
      const faded = !!focus && !held.has(line);
      line.material.transparent = faded;
      line.material.opacity = faded ? 0.18 : 1;
      line.material.linewidth = baseWidth.get(line) * (faded ? 0.7 : dim ? 0.6 : 1);
      line.material.needsUpdate = true;
    }

    material.transparent = !!focus || dim;
    material.opacity = focus ? 0.25 : dim ? 0.35 : 1;
    material.needsUpdate = true;
  }

  /** Push `viewMode` + `authoredWanted` onto the batches. One place, so the two can never
   *  disagree about which set of lines is on. */
  function applyBatchVisibility() {
    const axial = viewMode === 'front' || viewMode === 'rear';
    if (outline) outline.visible = authoredWanted;
    if (hidden) hidden.visible = authoredWanted;
    // The spigot's long edges are a silhouette: true only looking along the plate's axis.
    if (silhouette) silhouette.visible = authoredWanted && axial;
    // The far-side countersink, dashed from the front and continuous once turned over.
    if (farHidden) farHidden.visible = authoredWanted && viewMode !== 'rear';
    if (farVisible) farVisible.visible = authoredWanted && viewMode === 'rear';
  }

  return {
    group,
    mesh,

    setSolidVisible(on) { material.visible = on; },
    setOutlineVisible(on) { if (outline) outline.visible = on; },
    setHiddenVisible(on) { if (hidden) hidden.visible = on; },
    setCentreLinesVisible(on) {
      centreWanted = on;
      applyMaterialState(); // the line-type focus can override this, so it owns the flag
    },

    /**
     * Which named pose the camera is in. Two things on this part depend on the direction of
     * sight and on nothing else, so they are switched here rather than classified per edge:
     *   • the spigot's silhouette — a real edge of the ELEVATION, a false crease in a pictorial;
     *   • the far-side countersink — hidden from the front, visible once the plate is turned.
     * @param {'front'|'rear'|'free'} mode
     */
    setViewMode(mode) {
      viewMode = mode;
      applyBatchVisibility();
    },

    /** Re-state every lesson-level want in one call — used after a rebuild, where the batches
     *  and the material are brand new and remember nothing. */
    applyState({ viewMode: mode, authored, dimmed, lineFocus, centreLines }) {
      viewMode = mode ?? viewMode;
      authoredWanted = authored ?? authoredWanted;
      dimmedWanted = dimmed ?? dimmedWanted;
      focusWanted = lineFocus === undefined ? focusWanted : lineFocus;
      centreWanted = centreLines ?? centreWanted;
      applyBatchVisibility();
      applyMaterialState();
    },

    /**
     * Hand the linework over to (or take it back from) the live classifier. Off, every
     * authored stroke of the PART comes off the sheet so `lineDrawer.js` can draw the same
     * solid as it actually looks from here. The centre lines are not part of that hand-over:
     * an axis is a convention, not an edge, so no classifier will ever produce one.
     * @param {boolean} on
     */
    setAuthoredVisible(on) {
      authoredWanted = on;
      applyBatchVisibility();
      applyMaterialState(); // the study dim and the legend focus belong to the drawing only
    },

    /**
     * Step 1's line-alphabet legend: hold ONE of the part's line types at full strength and
     * fade the others back. Opacity and weight only — never a hue change, so the Two-Cue
     * Rule holds without introducing a colour the drawing does not already use.
     * @param {'visible'|'hidden'|'centre'|null} id
     */
    setLineFocus(id) {
      focusWanted = id || null;
      applyMaterialState();
    },

    /** Push the part into the background so a dimension study reads on top of it. The solid
     *  fades and the linework thins — never a colour change, so the Two-Cue Rule holds. */
    setDimmed(on) {
      dimmedWanted = on;
      applyMaterialState();
    },

    setResolution(w, h) {
      resolution.set(w, h);
      for (const line of lineBatches) line.material.resolution.copy(resolution);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      for (const line of lineBatches) {
        line.geometry?.dispose();
        line.material?.dispose();
        group.remove(line);
      }
      group.remove(mesh);
      group.parent?.remove(group);
    },
  };
}

/** Overall envelope of one figure's rig in world units. */
export const rigExtents = (figure) => Object.freeze({
  halfLength: figure.plate.length / 2 / 10,
  halfHeight: figure.plate.height / 2 / 10,
  halfDepth: halfDepthOf(figure),
});
