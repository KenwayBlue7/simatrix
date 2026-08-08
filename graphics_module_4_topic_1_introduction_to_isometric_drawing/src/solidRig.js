// Solid rig — the teaching geometry for Introduction to Isometric Drawing.
//
// The topic deliberately teaches on TWO solids, each chosen for the half of the lesson it serves:
//
//   Steps 1–3  SQUARE PYRAMID  — "why do multiple orthographic views exist?"
//                Its three views are unmistakably different: front → triangle, top → square (with
//                the four sloping edges reading as diagonals), side → triangle. A solid whose views
//                all looked alike would quietly undermine the very question the steps are asking.
//
//   Steps 4–6  CUBE            — "what is the isometric position?"
//                Its three principal edges lie ALONG the three isometric axes, so the isometric
//                orientation is legible at a glance with nothing else to explain. A pyramid's
//                sloping edges would fight the axes for attention here.
//
// The swap is a taught moment, not a glitch: main.js cross-fades pyramid → cube on entering Step 4
// (see setActiveSolid), so the learner reads it as "we have moved to a simpler object for this
// idea".
//
// Everything is created ONCE and added to a persistent rig group; the steps toggle visibility and
// fade opacity — they never regenerate geometry, so the disposal contract in main.js's rebuild()
// sees a flat memory profile.
//
// Why fat lines: engineering linework must read at a real pixel weight. LineBasicMaterial caps at
// 1px on most GPUs (RULES.md §3.13), so edges use the three/addons Line2 stack. Bodies set
// polygonOffset so faces never z-fight the edge outline (RULES.md §3.18). Colours are read from
// CSS tokens at runtime — no hard-coded hex (RULES.md §4.1).
//
// Layering (CLAUDE.md): leaf module. Imports THREE + the fat-line addons only; main.js owns the
// scene, the camera, and the CSS2D labels that annotate the anchor points this module exposes.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/** Half-edge of the cube (so it spans 2 world units on every axis). */
const H = 1;

/** Half-width of the pyramid's square base (base side = 2 world units, matching the cube's). */
const B = 1;

/** Half-height of the pyramid. Taller than half its base so the front view is a clear triangle
 *  rather than a squat wedge. */
const PY = 1.2;

/** ConeGeometry takes the base CIRCUMradius; for a square base of half-width B that is B·√2.
 *  Rotating the mesh by 45° then lands the four corners squarely on ±B in X and Z. */
const PYRAMID_CIRCUMRADIUS = B * Math.SQRT2;

/** How far the second (Step 5) cube sits to the right of the main one, centre to centre. */
export const SECOND_SOLID_X = 4.6;

/** How far each isometric axis overshoots the cube, so the axes read as guide lines rather than
 *  as three more cube edges. */
const AXIS_OVERSHOOT = 0.9;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Wrap a geometry as a Simatrix teaching solid: a flat-shaded body plus its fattened ink edge
 * outline, returned as one group.
 *
 * Both materials are `transparent` so a step can cross-fade the solid in and out (Step 4's
 * pyramid → cube swap, and Step 6 dissolving the drawing away while the construction is up).
 * They sit at opacity 1 with depthWrite on, so a solid still reads as a solid object.
 *
 * @param {THREE.BufferGeometry} bodyGeo  Owned by the caller's lifetime (never disposed here).
 * @param {THREE.Vector2} resolution      Drawing-buffer size for LineMaterial.
 * @returns {{ group: THREE.Group, bodyMaterial: THREE.MeshPhongMaterial,
 *             edgeMaterial: LineMaterial, lineGeo: LineSegmentsGeometry }}
 */
function buildSolid(bodyGeo, resolution) {
  const group = new THREE.Group();

  // shininess 0 + flatShading + flat lights = a CAD/textbook read, never a glossy render
  // (RULES.md §3.24). flatShading keeps each of the pyramid's four triangular faces a distinct
  // plane instead of smoothing them into a cone. polygonOffset lifts the faces behind the edge
  // lines so the outline stays crisp.
  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(cssVar('--color-solid-fill')),
    shininess: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    transparent: true,
    opacity: 1,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMaterial);
  group.add(body);

  // Fattened edge outline (Line2 stack). EdgesGeometry gives the true hard edges — 12 for the
  // cube, 8 for the pyramid (four base edges + four slant edges) — and we lift them into a
  // LineSegmentsGeometry so LineMaterial can draw them at a real pixel width.
  const edges = new THREE.EdgesGeometry(bodyGeo);
  const lineGeo = new LineSegmentsGeometry().fromEdgesGeometry(edges);
  const edgeMaterial = new LineMaterial({
    color: new THREE.Color(cssVar('--color-ink')),
    linewidth: 2.4,
    transparent: true,
    opacity: 1,
  });
  edgeMaterial.resolution.copy(resolution);
  const outline = new LineSegments2(lineGeo, edgeMaterial);
  outline.computeLineDistances();
  group.add(outline);
  edges.dispose();

  return { group, bodyMaterial, edgeMaterial, lineGeo };
}

/**
 * Build one isometric axis as a fattened line from the cube's near-bottom corner outward along
 * `dir`. Starts fully transparent so a step can fade the three axes in one at a time.
 * @param {THREE.Vector3} origin  The shared corner the three axes spring from.
 * @param {THREE.Vector3} dir     Unit direction along a cube edge.
 * @param {number} length        World length of the drawn axis.
 * @param {THREE.Vector2} resolution
 * @returns {{ line: LineSegments2, material: LineMaterial, tip: THREE.Vector3 }}
 */
function buildAxis(origin, dir, length, resolution) {
  const tip = origin.clone().addScaledVector(dir, length);
  const geo = new LineSegmentsGeometry();
  geo.setPositions([origin.x, origin.y, origin.z, tip.x, tip.y, tip.z]);
  const material = new LineMaterial({
    color: new THREE.Color(cssVar('--color-ink')),
    linewidth: 3.2,
    transparent: true,
    opacity: 0,
  });
  material.resolution.copy(resolution);
  const line = new LineSegments2(geo, material);
  line.computeLineDistances();
  line.visible = false;
  return { line, material, tip };
}

/**
 * Assemble the full rig.
 * @param {number} w  Drawing-buffer width.
 * @param {number} h  Drawing-buffer height.
 * @typedef {{ line: LineSegments2, material: LineMaterial }} Seg
 * @returns {{
 *   group: THREE.Group,
 *   pyramid: THREE.Group,
 *   cube: THREE.Group,
 *   cubeB: THREE.Group,
 *   axes: { line: LineSegments2, material: LineMaterial, tip: THREE.Vector3 }[],
 *   axisOrigin: THREE.Vector3,
 *   guides: { width: Seg, depth: Seg, height: Seg, rest: Seg[], all: Seg[] },
 *   faceOutlines: { front: Seg, top: Seg, side: Seg },
 *   faceAnchors: { front: THREE.Vector3, top: THREE.Vector3, side: THREE.Vector3 },
 *   labelAnchors: { projection: THREE.Vector3, view: THREE.Vector3 },
 *   setPyramidOpacity: (value: number) => void,
 *   setCubeOpacity: (value: number) => void,
 *   setResolution: (w: number, h: number) => void,
 * }}
 */
export function buildSolidRig(w, h) {
  const resolution = new THREE.Vector2(w, h);
  const group = new THREE.Group();

  // ---- Steps 1–3: the square pyramid --------------------------------------------------------
  // A 4-sided cone IS a square pyramid: square base, four identical triangular faces, apex
  // centred above the base by construction. The 45° spin puts the base corners on ±B in X and Z,
  // so the base edges run square to the world axes and the front/side views are true triangles.
  const pyramidGeo = new THREE.ConeGeometry(PYRAMID_CIRCUMRADIUS, 2 * PY, 4);
  const pyramidParts = buildSolid(pyramidGeo, resolution);
  const pyramid = pyramidParts.group;
  pyramid.rotation.y = Math.PI / 4;
  group.add(pyramid);

  // ---- Steps 4–6: the cube ------------------------------------------------------------------
  const cubeGeo = new THREE.BoxGeometry(2 * H, 2 * H, 2 * H);
  const cubeParts = buildSolid(cubeGeo, resolution);
  const cube = cubeParts.group;
  cube.visible = false; // the pyramid holds the stage until Step 4 cross-fades them
  group.add(cube);

  const secondGeo = new THREE.BoxGeometry(2 * H, 2 * H, 2 * H);
  const secondParts = buildSolid(secondGeo, resolution);
  const cubeB = secondParts.group;
  cubeB.position.x = SECOND_SOLID_X;
  cubeB.visible = false;
  group.add(cubeB);

  // The three isometric axes spring from the cube corner nearest the isometric camera
  // (+X / -Y / +Z corner). Drawn along the three edges that meet there — one runs straight up
  // (this reads vertical in the isometric view), the other two recede — plus a small overshoot.
  // This alignment is exactly why the isometric half of the lesson is taught on a cube.
  const axisOrigin = new THREE.Vector3(H, -H, H);
  const axisSpecs = [
    new THREE.Vector3(0, 1, 0),  // up  → the vertical isometric edge
    new THREE.Vector3(-1, 0, 0), // back-left
    new THREE.Vector3(0, 0, -1), // back-right
  ];
  const axes = axisSpecs.map((dir) =>
    buildAxis(axisOrigin, dir, 2 * H + AXIS_OVERSHOOT, resolution));
  axes.forEach((a) => group.add(a.line));

  // ---- Step 6's construction, as INDIVIDUALLY drawable pieces -------------------------------
  // The guide box used to be one object that faded in whole, which read as a morph rather than as
  // a drawing being built. It is now twelve separate segments plus three face outlines, each with
  // its own material, so the orchestrator can draw exactly one line at a time — the width edge as
  // the width arrives, the depth edge as the depth arrives, and so on — and then bring the solid
  // up one face at a time. That is the difference between watching a transformation and watching
  // someone draw.
  const guideAll = [];
  function guideSegment(from, to, { ink = false } = {}) {
    const geo = new LineSegmentsGeometry();
    geo.setPositions([from.x, from.y, from.z, to.x, to.y, to.z]);
    const material = new LineMaterial({
      color: new THREE.Color(cssVar(ink ? '--color-ink' : '--color-bench-grey')),
      linewidth: ink ? 2.4 : 1.8,
      transparent: true,
      opacity: 0,
    });
    material.resolution.copy(resolution);
    const line = new LineSegments2(geo, material);
    line.computeLineDistances();
    line.visible = false;
    group.add(line);
    const seg = { line, material };
    guideAll.push(seg);
    return seg;
  }

  const V = (x, y, z) => new THREE.Vector3(x * H, y * H, z * H);

  // The three MEASURED lines: each runs from the axis origin corner along one isometric direction
  // for exactly the object's size in that direction. The axes give the direction; these give the
  // amount — which is precisely what gets carried over from the orthographic views.
  // Drawn at INK weight: these are the measurements that arrived from the views, so they must read
  // as the strongest thing on the board. The axes behind them dim to faint direction guides once
  // they have done their job, and the nine box-closing edges stay light bench-grey.
  const guides = {
    width: guideSegment(V(1, -1, 1), V(-1, -1, 1), { ink: true }),
    depth: guideSegment(V(1, -1, 1), V(1, -1, -1), { ink: true }),
    height: guideSegment(V(1, -1, 1), V(1, 1, 1), { ink: true }),
    rest: [],
    all: guideAll,
  };
  // The remaining nine edges, which close the guide box once all three sizes are on the board.
  [[-1, -1], [1, 1], [1, -1]].forEach(([y, z]) => guides.rest.push(guideSegment(V(1, y, z), V(-1, y, z))));
  [[-1, -1], [1, 1], [-1, 1]].forEach(([x, y]) => guides.rest.push(guideSegment(V(x, y, 1), V(x, y, -1))));
  [[-1, 1], [1, -1], [-1, -1]].forEach(([x, z]) => guides.rest.push(guideSegment(V(x, -1, z), V(x, 1, z))));

  /** Loop of 4 edges around one face, as a single drawable object (ink weight, like real linework). */
  function faceOutline(corners) {
    const pts = [];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pts);
    const material = new LineMaterial({
      color: new THREE.Color(cssVar('--color-ink')),
      linewidth: 2.4,
      transparent: true,
      opacity: 0,
    });
    material.resolution.copy(resolution);
    const line = new LineSegments2(geo, material);
    line.computeLineDistances();
    line.visible = false;
    group.add(line);
    return { line, material };
  }

  // Only these three faces are visible from the isometric direction, so these are the three that
  // get drawn — front, then top, then side, the order an instructor works in.
  const faceOutlines = {
    front: faceOutline([V(-1, -1, 1), V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1)]),
    top: faceOutline([V(-1, 1, 1), V(1, 1, 1), V(1, 1, -1), V(-1, 1, -1)]),
    side: faceOutline([V(1, -1, 1), V(1, -1, -1), V(1, 1, -1), V(1, 1, 1)]),
  };

  // Face-centre anchors for the Step-1 Front / Top / Side labels. These sit on the PYRAMID, the
  // solid Step 1 teaches on: the centroids of its front and right triangular faces, and a point
  // just above the apex for the top.
  const faceAnchors = {
    front: new THREE.Vector3(0, -PY / 3, (2 * B) / 3),
    top: new THREE.Vector3(0, PY + 0.34, 0),
    side: new THREE.Vector3((2 * B) / 3, -PY / 3, 0),
  };

  // Title anchors above each cube for the Step-5 "Isometric Projection" / "Isometric View" labels.
  const labelAnchors = {
    projection: new THREE.Vector3(0, H + 0.9, 0),
    view: new THREE.Vector3(SECOND_SOLID_X, H + 0.9, 0),
  };

  const materials = [
    pyramidParts.edgeMaterial, cubeParts.edgeMaterial, secondParts.edgeMaterial,
    ...guideAll.map((g) => g.material),
    ...Object.values(faceOutlines).map((f) => f.material),
    ...axes.map((a) => a.material),
  ];
  function setResolution(nw, nh) {
    materials.forEach((m) => m.resolution.set(nw, nh));
  }

  /** Fade a solid (body + ink edges) as one object, dropping it out of the draw when invisible. */
  function fade(parts, node, value) {
    parts.bodyMaterial.opacity = value;
    parts.edgeMaterial.opacity = value;
    node.visible = value > 0.001;
  }

  return {
    group,
    pyramid,
    cube,
    cubeB,
    axes: axes.map(({ line, material, tip }) => ({ line, material, tip })),
    axisOrigin,
    guides,
    faceOutlines,
    faceAnchors,
    labelAnchors,
    setPyramidOpacity: (v) => fade(pyramidParts, pyramid, v),
    setCubeOpacity: (v) => fade(cubeParts, cube, v),
    setResolution,
  };
}
