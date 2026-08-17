// Construction engine — the linework an engineer would actually draw, in the order they draw it.
//
// This module turns a solid's DATA (`shapeData`: bounds + construction stages) into three separate,
// independently-animatable layers of 3D linework:
//
//   axes    the three isometric axes, springing from ONE corner — Phase A
//   box     the enclosing bounding box, built on those axes — Phase B
//   stages  the per-solid construction, in the order the data lists it — Phase C
//
// It draws them; it does not sequence them. `constructionSteps.js` owns the choreography and
// `main.js` owns the clock, so the same geometry can be replayed at a different tempo in Step 6's
// summary without this file knowing anything about steps.
//
// THE GROWTH TRICK. Phase A must "draw" the axes and Phase B must "grow" the box, but rewriting a
// `LineSegmentsGeometry` every frame would be wasteful and would fight the disposal contract. Both
// layers are therefore built with their geometry expressed RELATIVE to the shared origin corner and
// parented to a group positioned at it — so scaling that group from 0 → 1 makes the lines extend out
// of the corner along the axes, which is precisely the motion a hand makes. No geometry is ever
// rewritten after construction.
//
// ONE SWITCH, over primitive KINDS (`axisLine` / `ring` / `poly` / `verticals` / `spokes` /
// `generators` / `billboard` / `marker`) — never over solid names (ADR-043).
//
// Layering (CLAUDE.md): leaf module. Imports THREE, the fat-line addons, and the stateless
// `shapeData` / `tokens` utils (RULES.md §3.6a). It never touches the DOM, the camera, or a sibling
// behaviour leaf.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { toWorld, axisSymbol } from './shapeData.js';
import { roleColor, WEIGHT } from './tokens.js';

/** Segments used to draw a construction circle. It must read as a smooth ellipse in isometric. */
const RING_SEGMENTS = 72;

/** How far each axis overshoots the bounding box, so an axis reads as a GUIDE rather than as one
 *  more edge of the box it carries. */
const AXIS_OVERSHOOT_MM = 14;

/** Arm length of the small cross that marks an apex or a centre. */
const MARKER_MM = 4;

/**
 * The three isometric axis directions, in the order the lesson names them. The vertical one stays
 * vertical on the page; the other two recede equally to either side — which, from the isometric
 * camera direction, is what puts them at 30° to the horizontal.
 */
export const AXIS_SPECS = [
  { key: 'height', dirKey: 'height', dir: new THREE.Vector3(0, 1, 0), label: 'Height', from: 'side' },
  { key: 'width', dirKey: 'width', dir: new THREE.Vector3(-1, 0, 0), label: 'Width', from: 'front' },
  { key: 'depth', dirKey: 'depth', dir: new THREE.Vector3(0, 0, -1), label: 'Depth', from: 'top' },
];

// ---------------------------------------------------------------------------
// Primitive → positions. Each returns a flat [x,y,z, x,y,z, …] segment list in WORLD units,
// expressed relative to the solid's own origin (centred in plan, resting on y = 0).
// ---------------------------------------------------------------------------

function ringPositions(y, r, segments = RING_SEGMENTS) {
  const pos = [];
  const R = toWorld(r); const Y = toWorld(y);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    pos.push(Math.sin(a0) * R, Y, Math.cos(a0) * R, Math.sin(a1) * R, Y, Math.cos(a1) * R);
  }
  return pos;
}

function polyPositions(y, pts) {
  const pos = [];
  const Y = toWorld(y);
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    pos.push(toWorld(x0), Y, toWorld(z0), toWorld(x1), Y, toWorld(z1));
  }
  return pos;
}

function verticalPositions(y0, y1, pts) {
  const pos = [];
  for (const [x, z] of pts) {
    pos.push(toWorld(x), toWorld(y0), toWorld(z), toWorld(x), toWorld(y1), toWorld(z));
  }
  return pos;
}

function spokePositions(y, apexY, pts) {
  const pos = [];
  for (const [x, z] of pts) {
    pos.push(toWorld(x), toWorld(y), toWorld(z), 0, toWorld(apexY), 0);
  }
  return pos;
}

function generatorPositions(y0, r0, y1, r1, count) {
  const pos = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pos.push(
      Math.sin(a) * toWorld(r0), toWorld(y0), Math.cos(a) * toWorld(r0),
      Math.sin(a) * toWorld(r1), toWorld(y1), Math.cos(a) * toWorld(r1),
    );
  }
  return pos;
}

/**
 * Corner i of one outline joined to corner i of another, at two heights — the sloping edges of a
 * frustum of a pyramid. `verticals` cannot draw them (they do not rise straight) and `spokes` cannot
 * (there is no single apex to run to), so this is its own primitive rather than a flag on either.
 */
function edgePositions(y0, pts0, y1, pts1) {
  const pos = [];
  const n = Math.min(pts0.length, pts1.length);
  for (let i = 0; i < n; i++) {
    pos.push(
      toWorld(pts0[i][0]), toWorld(y0), toWorld(pts0[i][1]),
      toWorld(pts1[i][0]), toWorld(y1), toWorld(pts1[i][1]),
    );
  }
  return pos;
}

function markerPositions(y) {
  const Y = toWorld(y); const m = toWorld(MARKER_MM);
  return [-m, Y, 0, m, Y, 0, 0, Y - m, 0, 0, Y + m, 0, 0, Y, -m, 0, Y, m];
}

function billboardPositions(r, half) {
  const R = toWorld(r);
  const full = half !== 'upper';
  const span = full ? Math.PI * 2 : Math.PI;
  const steps = full ? RING_SEGMENTS : RING_SEGMENTS / 2;
  const pos = [];
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * span;
    const a1 = ((i + 1) / steps) * span;
    pos.push(Math.cos(a0) * R, Math.sin(a0) * R, 0, Math.cos(a1) * R, Math.sin(a1) * R, 0);
  }
  return pos;
}

/**
 * THE one switch over primitive kinds.
 * @returns {{ positions: number[], billboard?: { y: number } } | null}
 */
function primitivePositions(p) {
  switch (p.k) {
    case 'axisLine': return { positions: [0, toWorld(p.y0), 0, 0, toWorld(p.y1), 0] };
    case 'ring': return { positions: ringPositions(p.y, p.r) };
    case 'poly': return { positions: polyPositions(p.y, p.pts) };
    case 'verticals': return { positions: verticalPositions(p.y0, p.y1, p.pts) };
    case 'spokes': return { positions: spokePositions(p.y, p.apexY, p.pts) };
    case 'generators': return { positions: generatorPositions(p.y0, p.r0, p.y1, p.r1, p.count) };
    case 'edges': return { positions: edgePositions(p.y0, p.pts0, p.y1, p.pts1) };
    case 'marker': return { positions: markerPositions(p.y) };
    case 'billboard': return { positions: billboardPositions(p.r, p.half), billboard: { y: toWorld(p.y) } };
    default: return null;
  }
}

// ---------------------------------------------------------------------------

/**
 * Build the whole construction rig for one solid at one set of dimensions.
 *
 * @param {object} args
 * @param {import('./shapeData.js').Solid} args.solid
 * @param {Record<string, number>} args.dims
 * @param {THREE.Vector2} args.resolution
 * @returns {{
 *   group: THREE.Group,
 *   origin: THREE.Vector3,
 *   bounds: { width:number, depth:number, height:number },
 *   axes: { key:string, label:string, from:string, group:THREE.Group, material:LineMaterial, tip:THREE.Vector3, lengthMm:number }[],
 *   boxes: { label:string, group: THREE.Group, material: LineMaterial, line: LineSegments2 }[],
 *   stages: { id:string, label:string, note:string, objects:THREE.Object3D[], materials:LineMaterial[] }[],
 *   billboards: THREE.Object3D[],
 *   setResolution: (w:number,h:number) => void,
 *   update: (camera: THREE.Camera) => void,
 *   dispose: () => void,
 * }}
 */
export function buildConstruction({ solid, dims, resolution }) {
  const group = new THREE.Group();
  // `materials` is everything to DISPOSE; `lineMaterials` is the subset that carries a screen-space
  // `resolution` and must be re-synced on resize (RULES.md §3.16). The face-highlight quads are
  // ordinary `MeshBasicMaterial`s and have no such property — keeping the two lists apart is what
  // stops the resize handler walking into an undefined `.resolution`.
  const owned = { geometries: [], materials: [], lineMaterials: [] };

  const bounds = solid.bounds(dims);
  const hw = toWorld(bounds.width) / 2;
  const hd = toWorld(bounds.depth) / 2;
  const h = toWorld(bounds.height);

  /** The corner every isometric drawing is started from: the bottom corner nearest the eye. */
  const origin = new THREE.Vector3(hw, 0, hd);

  /** Build one fat-line object from a positions array, at a given weight/role, invisible at rest. */
  function makeLine(positions, { role = 'construction', weight = WEIGHT.construction } = {}) {
    const geo = new LineSegmentsGeometry();
    geo.setPositions(positions);
    owned.geometries.push(geo);
    const material = new LineMaterial({
      color: roleColor(role),
      linewidth: weight,
      transparent: true,
      opacity: 0,
    });
    material.resolution.copy(resolution);
    owned.materials.push(material);
    owned.lineMaterials.push(material);
    const line = new LineSegments2(geo, material);
    line.computeLineDistances();
    line.visible = false;
    return { line, material };
  }

  // ---- Phase A: the three isometric axes ----------------------------------------------------
  // Each axis lives in its own group anchored at the shared origin, with its geometry running from
  // (0,0,0) outward — so scaling the group draws the axis OUT of the corner.
  const axes = AXIS_SPECS.map((spec) => {
    const lengthMm = bounds[spec.dirKey] + AXIS_OVERSHOOT_MM;
    const len = toWorld(lengthMm);
    const end = spec.dir.clone().multiplyScalar(len);
    const { line, material } = makeLine([0, 0, 0, end.x, end.y, end.z], {
      role: 'axis', weight: WEIGHT.axis,
    });
    const axisGroup = new THREE.Group();
    axisGroup.position.copy(origin);
    axisGroup.add(line);
    axisGroup.scale.setScalar(0.0001); // grows to 1 in Phase A
    group.add(axisGroup);
    return {
      key: spec.key,
      label: spec.label,
      /** Engineering notation for this box edge, read from the solid's own data (ADR-043). */
      symbol: axisSymbol(solid, spec.dirKey),
      from: spec.from,
      group: axisGroup,
      line,
      material,
      /** World-space tip, where the dimension callout is pinned. */
      tip: origin.clone().add(end),
      /** Midpoint of the box EDGE this axis carries — where a transferred size lands. */
      mid: origin.clone().addScaledVector(spec.dir, toWorld(bounds[spec.dirKey]) / 2),
      /** Unit direction, in world space. Phase A's angle annotation projects these. */
      dir: spec.dir.clone(),
      lengthMm: bounds[spec.dirKey],
    };
  });

  // ---- Phase B: the enclosing bounding box(es) -----------------------------------------------
  // Geometry is written relative to each box's own origin corner so the same scale-from-the-corner
  // growth applies: a box literally builds itself along the three axes just drawn.
  //
  // ONE BOX PER COMPONENT. A solid declares `partBoxes(dims)` when it is made of more than one
  // component, and each box stands on the finished top face of the one below — which is how a
  // combination is really blocked out, and the reason a cone's base ellipse can be inscribed in the
  // top face of the SLAB's box rather than judged by eye inside one larger box round both. A solid
  // that declares nothing gets exactly one box from its own bounds, identical to before.
  function makeBox({ width, depth, height, y = 0 }) {
    const bw = toWorld(width) / 2;
    const bd = toWorld(depth) / 2;
    const positions = [];
    const W = -2 * bw; const D = -2 * bd; const H = toWorld(height); // signed, FROM the corner
    const corners = [
      [0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D],
      [0, H, 0], [W, H, 0], [W, H, D], [0, H, D],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    for (const [a, b] of edges) positions.push(...corners[a], ...corners[b]);
    const built = makeLine(positions);
    const boxGroup = new THREE.Group();
    boxGroup.position.set(bw, toWorld(y), bd);
    boxGroup.add(built.line);
    boxGroup.scale.setScalar(0.0001); // grows to 1 in Phase B
    group.add(boxGroup);
    return { group: boxGroup, material: built.material, line: built.line };
  }

  const boxSpecs = solid.partBoxes?.(dims)
    ?? [{ label: solid.name, width: bounds.width, depth: bounds.depth, height: bounds.height, y: 0 }];
  const boxes = boxSpecs.map((bs) => ({ label: bs.label, ...makeBox(bs) }));

  // ---- Step 3: the three face highlights -----------------------------------------------------
  // Selecting a view on the orthographic sheet lights the face of the solid that view looks at, so
  // "Front View" stops being a caption and becomes a DIRECTION. Each quad sits on the bounding box
  // face it names and carries that plane's platform domain encoding (DESIGN.md §2.1) — VP amber for
  // the front, HP teal for the top, PP violet for the side. Colour is never the only cue: the sheet
  // caption goes accent-bold and a viewport label names the view at the same moment.
  const faces = {};
  {
    const faceSpecs = [
      { key: 'front', role: 'vp', w: 2 * hw, h, pos: [0, h / 2, hd], rot: [0, 0, 0] },
      { key: 'top', role: 'hp', w: 2 * hw, h: 2 * hd, pos: [0, h, 0], rot: [-Math.PI / 2, 0, 0] },
      { key: 'side', role: 'pp', w: 2 * hd, h, pos: [hw, h / 2, 0], rot: [0, Math.PI / 2, 0] },
    ];
    for (const f of faceSpecs) {
      const geo = new THREE.PlaneGeometry(f.w, f.h);
      owned.geometries.push(geo);
      const material = new THREE.MeshBasicMaterial({
        color: roleColor(f.role),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      owned.materials.push(material);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(...f.pos);
      mesh.rotation.set(...f.rot);
      mesh.visible = false;
      group.add(mesh);
      faces[f.key] = { mesh, material, center: mesh.position.clone() };
    }
  }

  // ---- Phase C: the per-solid construction stages --------------------------------------------
  const billboards = [];
  const stages = solid.construction(dims).map((st) => {
    const objects = [];
    const materials = [];
    for (const prim of st.draw) {
      const built = primitivePositions(prim);
      if (!built) continue;
      const { line, material } = makeLine(built.positions);
      if (built.billboard) {
        // A sphere's outline is a circle from every direction, so this ring always faces the eye.
        line.position.y = built.billboard.y;
        billboards.push(line);
      }
      group.add(line);
      objects.push(line);
      materials.push(material);
    }
    return { id: st.id, label: st.label, note: st.note, objects, materials };
  });

  return {
    group,
    origin,
    bounds,
    axes,
    /** One growable box per component; a single solid has exactly one, as before. */
    boxes,
    stages,
    faces,
    billboards,

    setResolution(w, hgt) { owned.lineMaterials.forEach((m) => m.resolution.set(w, hgt)); },

    update(camera) { billboards.forEach((b) => b.quaternion.copy(camera.quaternion)); },

    dispose() {
      group.removeFromParent();
      owned.geometries.forEach((g) => g.dispose());
      owned.materials.forEach((m) => m.dispose());
      owned.geometries.length = 0;
      owned.materials.length = 0;
      owned.lineMaterials.length = 0;
      billboards.length = 0;
      group.clear();
    },
  };
}
