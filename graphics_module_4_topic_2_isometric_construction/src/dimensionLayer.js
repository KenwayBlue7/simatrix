// Dimension layer — the overall sizes, drawn the way a drawing office would draw them.
//
// These used to be three floating text labels beside three edges. A label beside an edge does not
// say WHICH span it measures — it only sits near it — so on a solid with three different sizes the
// learner had to infer the pairing. A dimension does say it: two extension lines fix the exact
// span, a dimension line runs between them, and an arrowhead at each end lands on the extension
// line it belongs to. That is the difference between a caption and a measurement, and this topic
// spends Phase B insisting the sizes come from somewhere specific.
//
// THE STANDARD (ADR-041, BIS SP 46:2003 Type B — the same one Module 2's orthographic sheet uses):
//   • extension lines start a small GAP off the point measured and OVERSHOOT the dimension line
//   • the dimension line is continuous and narrow, running between the two extension lines
//   • arrowheads are FILLED isosceles triangles, length L and full width L/3 (the 3:1 cue)
//   • the value sits centred just off the dimension line
//
// WHERE IT DIVERGES, AND WHY (ADR-049). Two deliberate departures from ADR-041:
//   1. Colour and weight are the CONSTRUCTION register (bench grey, the thinnest weight in the
//      scene), not `--color-ink`. On the orthographic sheet the dimensions ARE the subject; here
//      they annotate a pictorial whose object must stay the focus. Same standard, quieter voice.
//   2. Gap / overshoot / arrow sizes are WORLD units, not paper space. Module 2's sheet is a flat,
//      fixed-zoom drawing where paper-space sizing keeps the standard proportions; this scene is
//      orbited and dollied, and a paper-space arrowhead would need rewriting every frame — which is
//      exactly the per-frame geometry rewrite the construction engine is built to avoid.
//
// PLACEMENT. Each dimension is pushed OUTWARD off the span it measures, along a direction the
// caller supplies, and every push is axis-aligned with the isometric directions — so the three
// box-edge dimensions land in three different planes (width out the front, depth out the side,
// height off the near vertical corner) and cannot collide with each other or with the solid.
//
// Layering (CLAUDE.md): leaf module. Imports THREE, the fat-line addons and the stateless
// `shapeData` / `tokens` utils (RULES.md §3.6a). It owns its geometry and frees it; the CSS2D value
// labels belong to `labelLayer.js`, so this file returns anchors and never touches the DOM.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { roleColor, WEIGHT } from './tokens.js';

/** How far the dimension line stands off the span it measures. ONE value, so every dimension in
 *  the scene sits at the same distance and the set reads as aligned rather than scattered. */
const OFFSET = 0.46;
/** Clear air between the point measured and the start of its extension line. */
const GAP = 0.07;
/** How far the extension line runs past the dimension line, as on a real sheet. */
const OVERSHOOT = 0.13;
/** Arrowhead length. Full width is a third of it — the Type-B 3:1 cue (ADR-041). */
const ARROW_L = 0.24;
/** Lift of the value above the dimension line, on the same side as the push. */
const LABEL_LIFT = 0.2;
/**
 * Below this span an arrowhead pair would meet in the middle and the value would not fit between
 * them, so the arrows turn OUTWARD and land on the outside of the extension lines — the standard
 * small-dimension treatment, and the reason a 20 mm cube still reads cleanly.
 */
const MIN_INNER = ARROW_L * 2.6;

/**
 * Build one dimension assembly.
 *
 * @param {object} spec
 * @param {THREE.Vector3} spec.a     One end of the measured span, in world units.
 * @param {THREE.Vector3} spec.b     The other end.
 * @param {THREE.Vector3} spec.push  Outward direction the dimension is offset along.
 * @returns {{ lines:number[], arrows:number[], anchor:THREE.Vector3 }}
 */
function buildAssembly({ a, b, push }) {
  const dir = b.clone().sub(a);
  const span = dir.length();
  if (span < 1e-6) return null;
  dir.normalize();
  const out = push.clone().normalize();

  const a1 = a.clone().addScaledVector(out, OFFSET);
  const b1 = b.clone().addScaledVector(out, OFFSET);

  const lines = [];
  // Extension lines: off the measured point by GAP, past the dimension line by OVERSHOOT.
  for (const p of [a, b]) {
    const s = p.clone().addScaledVector(out, GAP);
    const e = p.clone().addScaledVector(out, OFFSET + OVERSHOOT);
    lines.push(s.x, s.y, s.z, e.x, e.y, e.z);
  }
  // The dimension line itself. When the arrows are turned outward it is extended past both ends so
  // they have linework to sit against.
  const outward = span < MIN_INNER;
  const tailA = outward ? a1.clone().addScaledVector(dir, -ARROW_L * 1.6) : a1;
  const tailB = outward ? b1.clone().addScaledVector(dir, ARROW_L * 1.6) : b1;
  lines.push(tailA.x, tailA.y, tailA.z, tailB.x, tailB.y, tailB.z);

  // Filled 3:1 arrowheads, in the plane the dimension is read in (the one spanned by the span
  // direction and the push), so they are never seen edge-on from an isometric viewpoint.
  const half = out.clone().multiplyScalar(ARROW_L / 6);
  const arrows = [];
  const head = (tip, along) => {
    const base = tip.clone().addScaledVector(along, ARROW_L);
    const p1 = base.clone().add(half);
    const p2 = base.clone().sub(half);
    arrows.push(tip.x, tip.y, tip.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  };
  // Tips always land ON the extension lines; only which side the body sits changes.
  head(a1, outward ? dir.clone().negate() : dir);
  head(b1, outward ? dir : dir.clone().negate());

  const anchor = a1.clone().add(b1).multiplyScalar(0.5).addScaledVector(out, LABEL_LIFT);
  return { lines, arrows, anchor };
}

/**
 * Build every dimension for one solid at one set of sizes.
 *
 * @param {object} args
 * @param {{key:string,symbol:string,a:THREE.Vector3,b:THREE.Vector3,push:THREE.Vector3,text:string}[]} args.specs
 * @param {THREE.Vector2} args.resolution
 * @returns {{
 *   group: THREE.Group,
 *   items: { key:string, symbol:string, text:string, anchor:THREE.Vector3,
 *            objects:THREE.Object3D[], materials:THREE.Material[] }[],
 *   setResolution: (w:number,h:number) => void,
 *   dispose: () => void,
 * }}
 */
export function buildDimensions({ specs, resolution }) {
  const group = new THREE.Group();
  const owned = { geometries: [], materials: [], lineMaterials: [] };
  const items = [];

  for (const spec of specs) {
    const built = buildAssembly(spec);
    if (!built) continue;

    const geo = new LineSegmentsGeometry();
    geo.setPositions(built.lines);
    owned.geometries.push(geo);
    const lineMat = new LineMaterial({
      color: roleColor('dimension'),
      linewidth: WEIGHT.dimension,
      transparent: true,
      opacity: 0,
    });
    lineMat.resolution.copy(resolution);
    owned.materials.push(lineMat);
    owned.lineMaterials.push(lineMat);
    const line = new LineSegments2(geo, lineMat);
    line.computeLineDistances();
    line.visible = false;
    group.add(line);

    // Arrowheads are solid polygons, so they cannot live in the line batch (ADR-041 hit exactly
    // this); they are one small triangle soup per dimension, sharing the dimension's own fade.
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute(built.arrows, 3));
    arrowGeo.computeVertexNormals();
    owned.geometries.push(arrowGeo);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: roleColor('dimension'),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    owned.materials.push(arrowMat);
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.visible = false;
    group.add(arrowMesh);

    items.push({
      key: spec.key,
      symbol: spec.symbol,
      text: spec.text,
      anchor: built.anchor,
      objects: [line, arrowMesh],
      materials: [lineMat, arrowMat],
    });
  }

  return {
    group,
    items,
    setResolution(w, h) { owned.lineMaterials.forEach((m) => m.resolution.set(w, h)); },
    dispose() {
      group.removeFromParent();
      owned.geometries.forEach((g) => g.dispose());
      owned.materials.forEach((m) => m.dispose());
      owned.geometries.length = 0;
      owned.materials.length = 0;
      owned.lineMaterials.length = 0;
      items.length = 0;
      group.clear();
    },
  };
}
