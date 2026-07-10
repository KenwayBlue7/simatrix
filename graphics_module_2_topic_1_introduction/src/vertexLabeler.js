// Anatomy annotation layer for the "Introduction to Solids" gallery. Places the
// standard engineering annotations on the solid (each tagged with a userData.layer —
// 'axis' | 'labels' | 'generators' — so the gallery can toggle them independently via
// setLayerVisible):
//   • vertex labels — base corners A, B, C, D…, apex O for pyramids/cone, primed
//     A′, B′… on the top face of prisms/cube;
//   • the central AXIS drawn as a chain (centre) line, labelled O at the top/apex
//     and P at the base centre;
//   • for CURVED solids (cylinder/cone) the base ring is NUMBERED 1, 2, 3…instead
//     of lettered, and a fan of dashed surface GENERATOR lines is drawn from each
//     numbered base point to its top counterpart (cylinder) or the apex (cone).
//
// WHY CSS2DRenderer and not 3D text: the C# original used TextMeshPro, explicitly
// NOT ported (projectionDrawer.js header). A bundled SDF font would add weight to
// the ZIP (CLAUDE.md ≤ 10 MB) and still antialias poorly at small sizes. CSS2DObject
// renders a real DOM node positioned at a 3D point — zero asset cost, crisp at any
// DPR, themeable from the same CSS tokens as the rest of the chrome, and readable
// by assistive tech. It is reachable from the pinned import map (three/addons), so no
// new dependency and the offline contract holds after the initial module fetch.
//
// WHY LineSegments2 for the axis + generators: the chain line and generators need
// real pixel width and dashes (CLAUDE.md "LineMaterial + LineSegments2", "1px cap"
// limitation), so they use the same fattened-line shader as the projection layer.
// That shader needs the drawing-buffer resolution — main.js feeds it on creation and
// on every resize via setResolution(), exactly as it does for the projection drawer.
//
// Layering (CLAUDE.md): leaf module. Imports THREE + the CSS2DRenderer/line addons
// only; it does NOT import main.js, the data layer, or sibling layers. main.js owns
// the scene + the CSS2DRenderer instance and calls generate()/clear() from rebuild().

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/** Weld tolerance / quantization grid — identical to meshAnalyzer + projectionDrawer
 *  so a corner shared by several triangulated faces collapses to one label. */
const QUANT = 1000;

/**
 * A ring larger than this is treated as a CURVED approximation (cylinder/cone
 * base) rather than a true polygon: its points are numbered 1, 2, 3… and given
 * generator lines. The worked teaching polygons (triangle…hexagon) all sit at or
 * below this, so they are lettered fully with no generators.
 */
const MAX_RING_LABELS = 8;

/** Surface generators drawn on a curved solid (cylinder/cone). 12 = the classic
 *  textbook "clock position" count; the 24-segment curved geometry divides evenly
 *  by 12, so every other rim point becomes a numbered generator foot. */
const GENERATOR_COUNT = 12;

/** Line widths (CSS px) — subordinate to the solid's own edges (visible 2.5px). */
const AXIS_WIDTH_PX = 1.3;
const GENERATOR_WIDTH_PX = 1.2;

/** Dash geometry (world units) for the dashed generators — matches the projection
 *  layer's hidden-edge dashes so the two read as the same line type. */
const GENERATOR_DASH = Object.freeze({ size: 0.1, gap: 0.07 });

/**
 * Chain-line (centre-line) pattern in WORLD units: a long dash, a short gap, a
 * dot, a short gap, repeating — the standard "long-short-long" axis line. Authored
 * as REAL segment breaks (solid material) rather than a dash material, because a
 * single-period LineMaterial dash cannot express the long/short alternation.
 * Tuned for the worked square-pyramid scale (base 2, height 3).
 */
const CHAIN = Object.freeze({ long: 0.16, dot: 0.04, gap: 0.05 });

/** How far the centre line overshoots the solid's body at each end (world units) —
 *  centre lines project a little past the outline in a real drawing. */
const AXIS_OVERSHOOT = 0.12;

/** Letters for base corners: A, B, C, … (wraps to A1, B1… past 26, never expected). */
function letterFor(i) {
  return i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`;
}

/** Numbers for curved base points: 1, 2, 3… (cylinder/cone, instead of letters). */
function numberFor(i) {
  return String(i + 1);
}

/**
 * Unique LOCAL-space vertices of a mesh, deduped on the millimetre lattice. Local
 * (not world) space so we can classify by geometry ROLE — the base ring sits at
 * min local Y and the top/apex at max local Y regardless of how the solid is later
 * inclined or oriented in the world.
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.Vector3[]}
 */
function uniqueLocalVertices(geometry) {
  const pos = geometry.getAttribute('position');
  const seen = new Set();
  const out = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)},${Math.round(v.z * QUANT)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v.clone());
  }
  return out;
}

/** Order a ring's vertices CCW about the local Y axis (atan2 of x,z around centroid)
 *  so letter/number assignment is stable and the top ring aligns above the base. */
function orderRing(ring) {
  const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
  const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length;
  return [...ring].sort(
    (a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx),
  );
}

/** Evenly sample a large (curved) ring down to `n` representative points. With the
 *  24-gon curved geometry and n = 12 this picks every other rim point, and the base
 *  and top rings (identical angles) sample to aligned indices for clean generators. */
function sampleRing(ring, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ring[Math.round((i * ring.length) / n) % ring.length]);
  return out;
}

/**
 * Plan all Step-3 annotations for a solid, in LOCAL space.
 *
 * Groups vertices into a bottom ring (min local Y) and a top group (max local Y),
 * orders each about the axis, then assigns:
 *   • polygon base → A, B, C, D…        • curved base → 1, 2, 3… (+ generators)
 *   • single apex  → O                   • top ring    → A′, B′… / 1′, 2′…
 * Always adds the central axis (base centre → top/apex) with a P label at the base
 * centre and an O label at the top (reusing the apex O when one exists, so it is
 * never doubled).
 *
 * @param {THREE.BufferGeometry} geometry  Solid geometry (local space).
 * @returns {{
 *   labels: { local: THREE.Vector3, text: string }[],
 *   axis: { bottom: THREE.Vector3, top: THREE.Vector3 },
 *   generators: [THREE.Vector3, THREE.Vector3][],
 * }}
 */
function planAnnotations(geometry) {
  const verts = uniqueLocalVertices(geometry);
  const empty = {
    labels: [],
    axis: { bottom: new THREE.Vector3(), top: new THREE.Vector3() },
    generators: [],
  };
  if (verts.length === 0) return empty;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of verts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const tol = 1 / QUANT;
  const base = verts.filter((p) => Math.abs(p.y - minY) <= tol);
  const top = verts.filter((p) => Math.abs(p.y - maxY) <= tol);
  const flat = maxY - minY <= tol; // degenerate (shouldn't happen for a solid)

  const labels = [];
  const generators = [];

  // --- Base ring: curved → numbered 1,2,3… (+ generator feet); polygon → A,B,C… ---
  const baseOrdered = orderRing(base);
  const curved = baseOrdered.length > MAX_RING_LABELS;
  const baseRing = curved ? sampleRing(baseOrdered, GENERATOR_COUNT) : baseOrdered;
  baseRing.forEach((p, i) => labels.push({ local: p, text: curved ? numberFor(i) : letterFor(i) }));

  // --- Top: single apex → O ; otherwise a primed ring aligned with the base. ---
  let apex = null;
  if (!flat) {
    if (top.length === 1) {
      apex = top[0];
      labels.push({ local: apex, text: 'O' }); // apex (pyramid / cone)
    } else {
      const topOrdered = orderRing(top);
      const topRing = curved ? sampleRing(topOrdered, GENERATOR_COUNT) : topOrdered;
      topRing.forEach((p, i) => labels.push({ local: p, text: `${curved ? numberFor(i) : letterFor(i)}′` }));

      // Generators run base point → directly-above top point (cylinder). Both rings
      // were sampled at aligned angular indices, so i ↔ i pairs them vertically.
      if (curved) baseRing.forEach((p, i) => generators.push([p, topRing[i]]));
    }
    // Cone generators run each numbered base point → the single apex.
    if (curved && apex) baseRing.forEach((p) => generators.push([p, apex]));
  }

  // --- Central axis + its O / P labels. The axis runs base centre → top/apex,
  //     overshooting a touch at each end like a real centre line. P marks the base
  //     centre for every solid; O marks the top — reuse the apex O if one exists
  //     (pyramid/cone), otherwise add it at the top-face centre (prism/cube/cylinder). ---
  const bottom = new THREE.Vector3(0, minY - AXIS_OVERSHOOT, 0);
  const topAxis = new THREE.Vector3(0, maxY + AXIS_OVERSHOOT, 0);
  labels.push({ local: new THREE.Vector3(0, minY, 0), text: 'P' });
  if (!apex && !flat) labels.push({ local: new THREE.Vector3(0, maxY, 0), text: 'O' });

  return { labels, axis: { bottom, top: topAxis }, generators };
}

// ============================================================================
// Fattened-line helpers (chain line + dashed generators)
// ============================================================================

/**
 * Emit the chain-line (centre-line) segments between two world points as a flat
 * [x,y,z,x,y,z,…] position buffer — long dash, gap, dot, gap, repeating, authored
 * as real breaks so a plain (non-dashed) LineMaterial renders the alternation.
 * @param {THREE.Vector3} a Axis start (world).
 * @param {THREE.Vector3} b Axis end (world).
 * @returns {number[]}
 */
function chainPositions(a, b) {
  const out = [];
  const total = a.distanceTo(b);
  if (total < 1e-4) return out;
  const dir = b.clone().sub(a).multiplyScalar(1 / total);
  const at = (d) => a.clone().add(dir.clone().multiplyScalar(d));
  // One period: [drawn long][gap][drawn dot][gap].
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
      const p = at(d);
      const q = at(end);
      out.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    d = end;
    i += 1;
  }
  return out;
}

/**
 * Build a fattened-line object from a flat position buffer, or null if empty.
 * @param {number[]} positions Flat XYZ pairs; two points (6 floats) per segment.
 * @param {THREE.Color} color
 * @param {number} widthPx
 * @param {boolean} dashed
 * @param {THREE.Vector2} resolution
 * @returns {LineSegments2 | null}
 */
function buildLine(positions, color, widthPx, dashed, resolution) {
  if (positions.length === 0) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color: color.getHex(),
    linewidth: widthPx,
    dashed,
    dashSize: GENERATOR_DASH.size,
    gapSize: GENERATOR_DASH.gap,
    transparent: true, // legacy from the projection module's fade; harmless at full opacity
  });
  material.resolution.copy(resolution);
  const line = new LineSegments2(geometry, material);
  if (dashed) line.computeLineDistances();
  line.frustumCulled = false;
  return line;
}

/**
 * Wire an anatomy annotation controller onto a scene. The controller owns one
 * persistent group (added to the scene once) and rebuilds its CSS2DObject labels +
 * LineSegments2 axis/generators on each generate() call. Exposes a
 * {generate, clear, dispose, setLayerVisible, setResolution} lifecycle so main.js can
 * regenerate per shape and toggle the three annotation layers independently.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Vector2} [initialResolution] Drawing-buffer size for LineMaterial.
 * @returns {{
 *   group: THREE.Group,
 *   generate: (mesh: THREE.Mesh) => void,
 *   clear: () => void,
 *   dispose: () => void,
 *   setLayerVisible: (layer: 'axis'|'labels'|'generators', on: boolean) => void,
 *   setResolution: (w: number, h: number) => void,
 * }}
 */
export function initVertexLabeler(scene, initialResolution) {
  const group = new THREE.Group();
  group.name = 'Vertex Labels';
  scene.add(group);

  const resolution = initialResolution
    ? initialResolution.clone()
    : new THREE.Vector2(1, 1);

  /** Resolve a CSS custom property to a THREE.Color (tokens are sRGB hex). */
  const rootStyle = getComputedStyle(document.documentElement);
  const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

  /** Which annotation layers are currently shown. generate() re-applies these after
   *  every rebuild so a toggle persists across shape changes; setLayerVisible flips one
   *  live. Children are tagged with userData.layer ('axis' | 'labels' | 'generators'). */
  const layerVisible = { axis: true, labels: true, generators: true };
  function applyLayerVisibility() {
    for (const obj of group.children) {
      const layer = obj.userData.layer;
      if (layer) obj.visible = layerVisible[layer] !== false;
    }
  }

  /** Detach + dispose every child: CSS2DObjects (remove their DOM node) and the
   *  axis/generator LineSegments2 (geometry + material — WebGL disposal contract). */
  function clear() {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const obj = group.children[i];
      if (obj.element) obj.element.remove(); // CSS2DObject DOM node
      if (obj.isLineSegments2) {
        obj.geometry?.dispose();
        obj.material?.dispose();
      }
      group.remove(obj);
    }
  }

  /**
   * Place labels + draw the axis/generators for the given mesh. The mesh's
   * matrixWorld must be current (main.js calls mesh.updateWorldMatrix before this,
   * same as for buildEdgeMap). Positions are world-space; CSS2DRenderer reprojects
   * the labels every frame, so they track the camera with no per-frame work here.
   */
  function generate(mesh) {
    clear();
    group.visible = true; // a prior flatten may have hidden the group
    if (!mesh) return;
    const { labels, axis, generators } = planAnnotations(mesh.geometry);
    if (labels.length === 0) return;

    const matrixWorld = mesh.matrixWorld;
    const worldOf = (local) => local.clone().applyMatrix4(matrixWorld);

    // --- Axis chain line + generators (world space) ---
    const axisColor = cssColor('--color-ink-secondary');
    const genColor = cssColor('--color-bench-grey');

    const axisLine = buildLine(
      chainPositions(worldOf(axis.bottom), worldOf(axis.top)),
      axisColor, AXIS_WIDTH_PX, false, resolution,
    );
    if (axisLine) { axisLine.userData.layer = 'axis'; group.add(axisLine); }

    if (generators.length) {
      const genPositions = [];
      for (const [a, b] of generators) {
        const wa = worldOf(a);
        const wb = worldOf(b);
        genPositions.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z);
      }
      const genLine = buildLine(genPositions, genColor, GENERATOR_WIDTH_PX, true, resolution);
      if (genLine) { genLine.userData.layer = 'generators'; group.add(genLine); }
    }

    // --- Vertex / O / P labels. World positions + centroid so each can be nudged
    //     OUTWARD, off the solid's own linework: a label centred exactly on a vertex
    //     overlaps the edges meeting there. Offset scales with the solid's size. ---
    const worlds = labels.map(({ local }) => worldOf(local));
    const centroid = worlds
      .reduce((sum, v) => sum.add(v), new THREE.Vector3())
      .multiplyScalar(1 / worlds.length);
    let radius = 0;
    for (const w of worlds) radius = Math.max(radius, w.distanceTo(centroid));
    const offset = Math.max(0.06, radius * 0.12);

    labels.forEach(({ text }, i) => {
      const pos = worlds[i].clone();
      const dir = pos.clone().sub(centroid);
      if (dir.lengthSq() > 1e-6) pos.add(dir.normalize().multiplyScalar(offset));

      const el = document.createElement('span');
      el.className = 'vlabel';
      el.textContent = text;
      // Never intercept pointer events — drag-to-orbit must pass straight through.
      el.style.pointerEvents = 'none';

      const obj = new CSS2DObject(el);
      obj.userData.layer = 'labels';
      obj.position.copy(pos);
      obj.center.set(0.5, 0.5);
      group.add(obj);
    });

    applyLayerVisibility(); // re-assert any toggled-off layers onto the fresh children
  }

  /**
   * Show or hide one annotation layer ('axis' | 'labels' | 'generators'). The choice is
   * remembered and re-applied by generate() on the next rebuild, so a layer toggled off
   * stays off as the learner switches between solids.
   * @param {'axis'|'labels'|'generators'} layer
   * @param {boolean} on
   */
  function setLayerVisible(layer, on) {
    if (layer in layerVisible) {
      layerVisible[layer] = on;
      applyLayerVisibility();
    }
  }

  /** Push a new drawing-buffer size to the axis/generator LineMaterials and remember
   *  it for the next generate() (CLAUDE.md: keep LineMaterial.resolution in sync or
   *  the fattened lines render the wrong thickness). */
  function setResolution(w, h) {
    resolution.set(w, h);
    for (const obj of group.children) {
      if (obj.material instanceof LineMaterial) obj.material.resolution.copy(resolution);
    }
  }

  function dispose() {
    clear();
    scene.remove(group);
  }

  return { group, generate, clear, dispose, setLayerVisible, setResolution };
}
