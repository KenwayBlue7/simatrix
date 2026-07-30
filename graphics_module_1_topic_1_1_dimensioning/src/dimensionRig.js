// The subject of the lesson (Module 1 Topic 1.1 — Dimensioning): the Guide Plate solid
// and its BIS line-alphabet linework.
//
// This layer answers "what is the part?" — nothing about dimensions lives here. It builds:
//   • the SOLID — one closed, manifold, hard-edged mesh generated from dimensionData's
//     outline + feature loops (RULES.md §3.14 non-indexed hard edges, §3.29 manifold, no
//     overlapping or duplicated extrusions). The countersink and the spherical seat are
//     REAL geometry, not drawn-on circles, so orbiting the part never exposes a lie.
//   • TYPE A linework — continuous wide: the visible outline + every feature opening on the
//     front and back faces, plus the vertical corner edges of the prism.
//   • TYPE E/F linework — dashed narrow: the ONE genuinely hidden outline in the front
//     elevation, the countersink sunk in the FAR face. Rule 5 of the textbook's §4.6
//     ("dimensions are to be given from visible outlines rather than from hidden lines")
//     needs a real hidden line to argue against, so the part is designed to have exactly one.
//   • TYPE G linework — chain thin: the centre lines of every circular / symmetrical feature.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. It imports THREE, the fat-line addons,
// and `dimensionData.js` — this topic's single PURE-DATA module, the sibling-importable
// exception in the same spirit as `genericSolid.js` (see ADR-078). It never imports another
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
  PLATE, FEATURES, HALF_DEPTH, BORE_MOUTH_DIA, SPIGOT_RECT,
  outlinePoints, featurePoints, toWorld, toUnits,
} from './dimensionData.js';

const rootStyle = getComputedStyle(document.documentElement);
/** Resolve a CSS custom property to a THREE.Color — never a hard-coded hex (RULES.md §4.1). */
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

/**
 * Line widths in CSS pixels, and the dash/chain patterns, mapping the line alphabet onto the
 * screen. THESE ARE THE SIBLING FOUNDATIONS TOPIC'S NUMBERS, deliberately identical: the same
 * dashed countersink is drawn by THIS file in the elevation and by `lineDrawer.js` the moment
 * the part is turned, and a learner must not be able to tell the two apart. Foundations is the
 * reviewed benchmark, so its constants are the ones both sides use (ADR-081).
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
 * Build the Guide Plate rig: the solid + its Type A / E-F / G linework.
 *
 * @param {Object} [options]
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
  const { width = 1, height = 1 } = options;
  const resolution = new THREE.Vector2(width, height);

  const zF = HALF_DEPTH;   // front face
  const zB = -HALF_DEPTH;  // back face

  // --- Loops -----------------------------------------------------------------
  const contour = toWorldLoop(outlinePoints());
  const boreLoop = toWorldLoop(featurePoints(FEATURES.bore, CIRCLE_STEPS));
  // The bore's front mouth is opened out by an internal chamfer (Fig. 4.26c): ø46 at the
  // face, dropping back at 45° to the ø40 bore.
  const boreMouthLoop = circleLoop(FEATURES.bore.at, BORE_MOUTH_DIA / 2);
  const boreChamferDrop = toUnits(FEATURES.bore.chamfer.width); // 45° ⇒ axial = radial
  const squareLoop = toWorldLoop(featurePoints(FEATURES.square));
  const slotLoop = toWorldLoop(featurePoints(FEATURES.slot, CIRCLE_STEPS));
  const drillLoop = circleLoop(FEATURES.cskHole.at, FEATURES.cskHole.dia / 2);
  const cskLoop = circleLoop(FEATURES.cskHole.at, FEATURES.cskHole.countersink.dia / 2);
  const sphereRim = circleLoop(FEATURES.sphere.at, FEATURES.sphere.dia / 2);

  // Countersink depth from the included angle: a 90° cone has 45° flanks, so the axial
  // drop equals the radial step (textbook Fig. 4.27 — angle stated with the diameter).
  const cskDepth = toUnits(
    (FEATURES.cskHole.countersink.dia - FEATURES.cskHole.dia) / 2
    / Math.tan((FEATURES.cskHole.countersink.angle / 2) * Math.PI / 180),
  );

  // --- Solid -----------------------------------------------------------------
  // The FRONT cap is pierced by the Ø14 drill and the spherical seat's rim; the BACK cap is
  // pierced by the Ø24 countersink mouth and NOT by the seat (it is blind). That asymmetry
  // is the whole point: it puts exactly one hidden outline in the front elevation.
  const frontHoles = [boreMouthLoop, drillLoop, squareLoop, slotLoop, sphereRim].map(reversed);
  const backHoles = [boreLoop, cskLoop, squareLoop, slotLoop].map(reversed);

  const toVec2 = (loop) => loop.map((p) => new THREE.Vector2(p.x, p.y));
  const frontVerts = [contour, ...frontHoles].flat();
  const backVerts = [contour, ...backHoles].flat();
  const frontFaces = THREE.ShapeUtils.triangulateShape(toVec2(contour), frontHoles.map(toVec2));
  const backFaces = THREE.ShapeUtils.triangulateShape(toVec2(contour), backHoles.map(toVec2));

  const tris = [];
  pushCap(tris, frontVerts, frontFaces, zF, false); // faces +Z
  pushCap(tris, backVerts, backFaces, zB, true);    // faces −Z

  // Outer wall + the straight-through feature walls.
  pushWall(tris, contour, zF, contour, zB);
  for (const loop of [squareLoop, slotLoop].map(reversed)) {
    pushWall(tris, loop, zF, loop, zB);
  }
  // The bore: chamfer cone at the front mouth (ø46 → ø40 over 3 mm), then the plain bore.
  {
    const mouth = reversed(boreMouthLoop);
    const bore = reversed(boreLoop);
    pushWall(tris, mouth, zF, bore, zF - boreChamferDrop);
    pushWall(tris, bore, zF - boreChamferDrop, bore, zB);
  }
  // Countersunk hole: Ø14 cylinder from the front face down to the cone, then the 90° cone
  // opening out to Ø24 at the back face.
  {
    const drill = reversed(drillLoop);
    const csk = reversed(cskLoop);
    pushWall(tris, drill, zF, drill, zB + cskDepth);
    pushWall(tris, drill, zB + cskDepth, csk, zB);
  }
  // Spherical seat: a bowl of radius SR sunk into the FRONT face. Rings from the rim down
  // to a small ring, then a triangle fan onto the pole — no zero-area triangles (§3.30).
  {
    const R = toUnits(FEATURES.sphere.radius);
    const c = toWorld(FEATURES.sphere.at[0], FEATURES.sphere.at[1]);
    const ringAt = (theta) => {
      const r = R * Math.sin(theta);
      const n = sphereRim.length;
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
        // Fan onto the pole.
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
  }

  // Cylindrical spigot standing off the RIGHT end face, axis lying IN the drawing plane, so
  // the front elevation shows it as a rectangle (textbook Fig. 4.21). Its base is sunk 1 mm
  // INTO the plate so that no face of the spigot is coincident with the plate's end wall
  // (RULES.md §3.29 — coincident faces z-fight and are not manifold).
  const spigotR = toUnits(FEATURES.spigot.dia / 2);
  const spigotCy = toWorld(0, FEATURES.spigot.at[1]).y;
  const spigotX0 = toWorld(SPIGOT_RECT.x0 - 1, 0).x;   // 1 mm embedded
  const spigotX1 = toWorld(SPIGOT_RECT.x1, 0).x;
  const spigotFaceX = toWorld(SPIGOT_RECT.x0, 0).x;    // where it breaks the plate's face
  {
    const ring = (x) => {
      const out = [];
      for (let i = 0; i < CIRCLE_STEPS; i++) {
        const a = (i / CIRCLE_STEPS) * Math.PI * 2;
        out.push({ x, y: spigotCy + Math.cos(a) * spigotR, z: Math.sin(a) * spigotR });
      }
      return out;
    };
    const a = ring(spigotX0);
    const b = ring(spigotX1);
    for (let i = 0; i < CIRCLE_STEPS; i++) {
      const j = (i + 1) % CIRCLE_STEPS;
      // Wound so the generated normal points OUT of the cylinder. `ring()` walks θ
      // anticlockwise in the (y, z) plane with the axis along +x, which is the opposite hand
      // to pushWall's z-ordered convention — so the obvious winding here comes out inside-out.
      // That is not cosmetic: an inward normal makes lineDrawer's sample bias push the
      // silhouette's probe point INTO the metal, and the two long edges of the cylinder then
      // classify as hidden from every direction — a permanently dashed spigot in the 3-D view.
      pushTri(tris, a[i], b[j], b[i]);
      pushTri(tris, a[i], a[j], b[j]);
    }
    // Free end cap (a fan), and a base cap so the solid stays closed.
    const capB = { x: spigotX1, y: spigotCy, z: 0 };
    const capA = { x: spigotX0, y: spigotCy, z: 0 };
    for (let i = 0; i < CIRCLE_STEPS; i++) {
      const j = (i + 1) % CIRCLE_STEPS;
      pushTri(tris, capB, b[i], b[j]);
      pushTri(tris, capA, a[j], a[i]);
    }
  }

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
  mesh.name = 'Guide Plate';

  // --- Type A — continuous wide (visible outlines) ----------------------------
  const visiblePos = [];
  pushLoop(visiblePos, contour, zF);
  pushLoop(visiblePos, contour, zB);
  for (const loop of [squareLoop, slotLoop]) {
    pushLoop(visiblePos, loop, zF);
    pushLoop(visiblePos, loop, zB);
  }
  // The bore reads as TWO concentric visible circles from the front: the ø46 chamfer mouth
  // at the face, and the ø40 bore where the 3 × 45° chamfer runs out (Fig. 4.26c).
  pushLoop(visiblePos, boreMouthLoop, zF);
  pushLoop(visiblePos, boreLoop, zF - boreChamferDrop);
  pushLoop(visiblePos, boreLoop, zB);
  pushLoop(visiblePos, drillLoop, zF);      // the Ø14 drill, visible from the front
  pushLoop(visiblePos, sphereRim, zF);      // the spherical seat's rim
  // The spigot: its free end circle (which projects to the end line of the rectangle in the
  // front view) plus the two silhouette generatrices that ARE that rectangle's long edges.
  {
    const n = CIRCLE_STEPS;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      visiblePos.push(
        spigotX1, spigotCy + Math.cos(a0) * spigotR, Math.sin(a0) * spigotR,
        spigotX1, spigotCy + Math.cos(a1) * spigotR, Math.sin(a1) * spigotR,
      );
    }
  }
  // Vertical corner edges of the prism — only at genuine corners, so the fillet and the
  // corner radius stay smooth instead of sprouting one edge per tessellation point.
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

  // --- SILHOUETTE — the spigot's two long edges --------------------------------
  // A cylinder has no edge along its length: those two lines are its SILHOUETTE, and a
  // silhouette belongs to one direction of sight. Looking along the axis of the plate — the
  // elevation, either way round — they are exactly the long sides of the rectangle the
  // cylinder projects to, and the drawing needs them. Swung into the pictorial they become a
  // crease down a smooth surface, so they come off. That is a named-POSE switch, not per-edge
  // classification: nothing is recomputed on orbit, so ADR-078 stands.
  const silhouettePos = [];
  for (const s of [1, -1]) {
    silhouettePos.push(spigotFaceX, spigotCy + s * spigotR, 0, spigotX1, spigotCy + s * spigotR, 0);
  }

  // --- The far-side countersink, drawn BOTH ways --------------------------------
  // The same two circles either dashed or continuous. From the front they lie behind solid
  // material and are hidden; turned over they are the near face and are visible. Swapping
  // between them is the entire point of the "Turn over" chip — if the drawing did not change,
  // the chip would be telling the learner something the sheet contradicts.
  const farSidePos = [];
  pushLoop(farSidePos, cskLoop, zB);              // the countersink mouth
  pushLoop(farSidePos, drillLoop, zB + cskDepth); // where the cone runs out into the drill

  // --- Type E/F — dashed narrow -------------------------------------------------
  // The far-side countersink is this part's only hidden detail, and it lives in its own
  // batch above so it can be swapped; nothing else on the plate is ever hidden.
  const hiddenPos = [];

  // --- Type G — chain thin (centre lines) -------------------------------------
  const centrePos = [];
  const chainCross = (atMm, halfMm) => {
    const c = toWorld(atMm[0], atMm[1]);
    const h = toUnits(halfMm) + CENTRE_OVERSHOOT;
    pushChain(centrePos, c.x - h, c.y, c.x + h, c.y, zF);
    pushChain(centrePos, c.x, c.y - h, c.x, c.y + h, zF);
  };
  chainCross(FEATURES.bore.at, BORE_MOUTH_DIA / 2);
  {
    // The spigot's axis lies in the drawing plane, so its centre line runs ALONG the
    // rectangle — the giveaway that the rectangle is a cylinder (Fig. 4.21).
    const y = spigotCy;
    pushChain(centrePos, spigotFaceX - CENTRE_OVERSHOOT, y, spigotX1 + CENTRE_OVERSHOOT, y, 0);
  }
  chainCross(FEATURES.cskHole.at, FEATURES.cskHole.countersink.dia / 2);
  chainCross(FEATURES.square.at, FEATURES.square.side / 2);
  chainCross(FEATURES.sphere.at, FEATURES.sphere.dia / 2);
  {
    // The slot gets one axis through both centres plus a cross at each end.
    const [a, b] = FEATURES.slot.centres;
    const wa = toWorld(a[0], a[1]);
    const wb = toWorld(b[0], b[1]);
    const ov = toUnits(FEATURES.slot.width / 2) + CENTRE_OVERSHOOT;
    pushChain(centrePos, wa.x - ov, wa.y, wb.x + ov, wb.y, zF);
    const h = toUnits(FEATURES.slot.width / 2) + CENTRE_OVERSHOOT;
    pushChain(centrePos, wa.x, wa.y - h, wa.x, wa.y + h, zF);
    pushChain(centrePos, wb.x, wb.y - h, wb.x, wb.y + h, zF);
  }

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
  group.name = 'Guide Plate rig';
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
   * two never double up (ADR-081).
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

/** Overall envelope of the rig in world units — used by main.js to frame the camera. */
export const RIG_EXTENTS = Object.freeze({
  halfLength: PLATE.length / 2 / 10,
  halfHeight: PLATE.height / 2 / 10,
  halfDepth: HALF_DEPTH,
});
