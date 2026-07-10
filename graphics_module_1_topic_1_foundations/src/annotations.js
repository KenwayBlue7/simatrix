// Authored annotation layer (Module 1 Topic 1) — the two BIS line types that are
// NOT produced by the live classifier: Type G centre lines and Type B dimensions.
//
// WHY THESE ARE AUTHORED, NOT CLASSIFIED. Type A (visible) and Type E/F (hidden) are
// edges of the solid — their solid-vs-dashed state depends on the camera, so the
// line drawer recomputes them on orbit. Centre lines and dimensions are draughting
// ANNOTATIONS: they belong to the drawing, not the body, and do not change as the
// part turns. So we build them ONCE as real 3D fat-line geometry that simply rides
// along with the model (orbits with it, no per-frame reprojection).
//
// Layering (ADR-007 star rule / RULES.md §3.6): imports only THREE + the line addons.
// It does NOT import bearingBlock.js, meshAnalyzer.js, lineDrawer.js, labelLayer.js,
// or main.js. main.js passes the (already-computed, centred, world-space) dimension
// table from BEARING_BLOCK_DIMS, so this leaf never reaches into the generator.
//
// FAT-LINE STACK (RULES.md §3.12–§3.13, DESIGN.md §3). Every stroke is a
// LineSegments2 + LineMaterial, never LineBasicMaterial. resolution is kept in sync
// on resize (RULES.md §3.16). Both batches are SOLID materials — the Type G chain
// look is authored as real segment breaks (chainPositions), not a dash material,
// because a single-period LineMaterial dash cannot express the long-dash / dot
// alternation of a centre line (same technique as Module 2's vertexLabeler).
//
// THE NUMERIC VALUES (90 / 46 / Ø30) are NOT drawn here — they are CSS2D pills owned
// by labelLayer.js. This module computes their world anchors from the same geometry
// it dimensions and exposes them via getDimensionValueLabels(); main.js hands that
// list to labelLayer so the two stay consistent without importing each other.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ============================================================================
// Tokens + visual-style constants
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);

/** Resolve a CSS custom property to a THREE.Color (sRGB hex). RULES.md §4.1 — no
 *  hard-coded hex; the token table is the single runtime source of truth. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/** Line widths in CSS pixels (LineMaterial.linewidth). DESIGN.md §2 line-type map. */
const WIDTH_PX = Object.freeze({
  centre: 1.3, // Type G — chain thin
  dimension: 1.0, // Type B — continuous narrow
});

/**
 * Declared drawing scale: 1 world unit = 10 mm (the platform convention, RULES.md
 * §6.8). The shown values are DERIVED FROM THE ACTUAL 3D MODEL at this scale —
 * baseLength 9.0 → 90, overall height 4.6 → 46, bore Ø 3.0 → 30 — NOT faked to the
 * textbook plummer-block figures (L120 / H50 / Ø40). This is deliberate per ADR-018
 * (favour physical fidelity over fudging): the dimension must read the part the
 * student is actually looking at. ❌ Do NOT "correct" these to the textbook numbers
 * (RULES.md §8.6 — it looks wrong but is intentional). Bare numbers per draughting
 * convention (the title block declares the unit); Ø carries its symbol.
 */
const MM_PER_UNIT = 10;

/**
 * Chain-line (centre-line) pattern in WORLD units: long dash · gap · dot · gap,
 * repeating — the standard long-short centre line. Tuned for this block's ~9-unit
 * scale. Authored as real breaks so a plain (non-dashed) LineMaterial renders the
 * alternation faithfully (a dash material has one period only).
 */
const CHAIN = Object.freeze({ long: 0.34, dot: 0.07, gap: 0.12 });

/** How far a centre line overshoots the feature it marks (world units) — centre
 *  lines project a little past the outline in a real drawing. */
const OVERSHOOT = 0.35;

/** Standoff of a dimension line from the body — BIS wants the dimension line at least 8 mm
 *  clear of the outline; 0.85 = 8.5 mm, intentionally compliant (do NOT reduce). And the
 *  overshoot of an extension line past the dimension line / arrowhead tip: 0.25 = 2.5 mm,
 *  inside the BIS 2–3 mm rule (world units). */
const DIM_OFFSET = 0.85;
const EXT_OVERSHOOT = 0.25;

/**
 * Arrowhead geometry (world units) — BIS SP 46:2003 / N.D. Bhatt: a CLOSED, solid-filled
 * triangle at a strict 3:1 length:width ratio. `len` is the tip-to-back length along the
 * dimension line; `width` (= len / 3) is the full spread at the back. 3 mm × 1 mm at the
 * declared 10 mm/unit drawing scale.
 */
const ARROW = Object.freeze({ len: 0.30, width: 0.10 }); // width === len / 3 (3:1)

/**
 * Push the authored linework this far PROUD of the front face (+Z) so the fat lines
 * never z-fight the mesh faces they sit on. The front face is at z = halfDepth; the
 * annotations ride a hair in front of it. (The mesh also carries polygonOffset,
 * RULES.md §3.18, but these lines are not edges of that mesh, so an explicit standoff
 * is the clean fix.)
 */
const FACE_PROUD = 0.06;

// ============================================================================
// Fat-line helpers
// ============================================================================

/**
 * Build one fattened-line object from a flat `[x,y,z, x,y,z, …]` positions array
 * (consecutive pairs = disjoint segments), or `null` for an empty batch. Solid
 * material (the Type G chain look comes from authored breaks, not a dash material).
 *
 * @param {number[]} positions
 * @param {THREE.Color} color
 * @param {number} widthPx
 * @param {THREE.Vector2} resolution Drawing-buffer size; required by LineMaterial.
 * @returns {LineSegments2 | null}
 */
function buildSegments(positions, color, widthPx, resolution) {
  if (positions.length === 0) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color: color.getHex(),
    linewidth: widthPx,
    dashed: false,
  });
  material.resolution.copy(resolution);
  const segments = new LineSegments2(geometry, material);
  segments.frustumCulled = false; // tiny geometry; avoids cull pop during orbit
  return segments;
}

/**
 * Append the chain-line (centre-line) segments between two world points to `out`
 * as flat XYZ pairs — long dash, gap, dot, gap, repeating — authored as real breaks
 * so a solid LineMaterial renders the alternation. (chainPositions lineage from
 * Module 2's vertexLabeler.)
 * @param {number[]} out Flat positions buffer to append to.
 * @param {THREE.Vector3} a Centre-line start (world).
 * @param {THREE.Vector3} b Centre-line end (world).
 */
function pushChain(out, a, b) {
  const total = a.distanceTo(b);
  if (total < 1e-4) return;
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
}

/** Append a straight solid segment a→b (world) to `out`. */
function pushSeg(out, a, b) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z);
}

/**
 * Append ONE solid-filled arrowhead triangle at `tip`, pointing along unit `dir`, lying in
 * the plane spanned by `dir` and `perp`. Pushes three vertices as flat XYZ (9 floats): the
 * tip and the two back corners ± half-width. BIS 3:1 — back length `ARROW.len`, full back
 * spread `ARROW.width` (= len/3). `out` feeds a MeshBasicMaterial triangle soup (NOT a line
 * batch), so the arrowhead reads as a filled wedge, not an open "<".
 * @param {number[]} out  Flat triangle-vertex buffer to append to.
 * @param {THREE.Vector3} tip
 * @param {THREE.Vector3} dir  Unit vector — the way the arrow points.
 * @param {THREE.Vector3} perp Unit vector perpendicular to dir (the back-spread axis).
 */
function pushArrowTriangle(out, tip, dir, perp) {
  const base = tip.clone().add(dir.clone().multiplyScalar(-ARROW.len));
  const w = perp.clone().multiplyScalar(ARROW.width / 2);
  const a = base.clone().add(w);
  const b = base.clone().sub(w);
  out.push(tip.x, tip.y, tip.z, a.x, a.y, a.z, b.x, b.y, b.z);
}

// ============================================================================
// Public factory
// ============================================================================

/**
 * Build the authored annotation layer (Type G centre lines + Type B dimensions) for
 * the bearing block. Returns a controller mirroring the line drawer's lifecycle so
 * main.js manages it identically (group / toggles / setResolution / dispose).
 *
 * @param {import('./bearingBlock.js').BEARING_BLOCK_DIMS} dims  Centred world dims.
 * @param {Object} [options]
 * @param {number} [options.width=window.innerWidth]
 * @param {number} [options.height=window.innerHeight]
 * @returns {{
 *   group: THREE.Group,
 *   showCentreLines: (v: boolean) => void,
 *   showDimensions: (v: boolean) => void,
 *   getDimensionValueLabels: () => { text: string, position: THREE.Vector3, isVertical: boolean }[],
 *   getArrowFocus: () => { position: THREE.Vector3, normal: THREE.Vector3 },
 *   setResolution: (w: number, h: number) => void,
 *   dispose: () => void,
 * }}
 */
export function createAnnotations(dims, options = {}) {
  const {
    width = window.innerWidth,
    height = window.innerHeight,
  } = options;

  const resolution = new THREE.Vector2(width, height);
  const centreColor = cssColor('--color-ink-secondary'); // Type G
  const dimColor = cssColor('--color-ink');              // Type B

  const zF = dims.halfDepth + FACE_PROUD; // annotation plane, proud of the front face
  const V = (x, y, z = zF) => new THREE.Vector3(x, y, z);

  // --- Type G — centre lines (chain) -----------------------------------------
  const centrePos = [];

  // Horizontal bore AXIS: along Z through the bore centre, overshooting the boss at
  // both ends so the axis reads as running right through the part.
  pushChain(
    centrePos,
    new THREE.Vector3(0, dims.axisY, -(dims.halfDepth + OVERSHOOT)),
    new THREE.Vector3(0, dims.axisY, dims.halfDepth + OVERSHOOT),
  );
  // Vertical line of symmetry: along Y on the front face, top of dome to under the foot.
  pushChain(centrePos, V(0, dims.topY + OVERSHOOT), V(0, dims.baseBottomY - OVERSHOOT));
  // Horizontal centre line of the bore on the front face → with the vertical symmetry
  // this gives the front bore circle its centre cross.
  pushChain(
    centrePos,
    V(-(dims.bossRadius + OVERSHOOT), dims.axisY),
    V(dims.bossRadius + OVERSHOOT, dims.axisY),
  );
  // A small centre cross at each vertical mounting hole, drawn on its TOP opening
  // (in the XZ plane at y = baseTopY) — the way a hole's centre is marked in plan.
  const crossArm = dims.mountRadius + OVERSHOOT * 0.6;
  for (const cx of dims.mountX) {
    pushChain(
      centrePos,
      new THREE.Vector3(cx - crossArm, dims.baseTopY, 0),
      new THREE.Vector3(cx + crossArm, dims.baseTopY, 0),
    );
    pushChain(
      centrePos,
      new THREE.Vector3(cx, dims.baseTopY, -crossArm),
      new THREE.Vector3(cx, dims.baseTopY, crossArm),
    );
  }

  // --- Type B — dimensions (overall length L, overall height H, bore Ø) -------
  const dimPos = [];
  const arrowPos = []; // filled arrowhead triangles (separate MeshBasicMaterial batch)
  /** @type {{ text: string, position: THREE.Vector3 }[]} */
  const valueLabels = [];

  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);

  // L — overall length, dimensioned BELOW the block on the front face.
  {
    const yDim = dims.baseBottomY - DIM_OFFSET;
    const xL = -dims.halfLength;
    const xR = dims.halfLength;
    // Extension lines down from each bottom corner, a touch past the dim line.
    pushSeg(dimPos, V(xL, dims.baseBottomY), V(xL, yDim - EXT_OVERSHOOT));
    pushSeg(dimPos, V(xR, dims.baseBottomY), V(xR, yDim - EXT_OVERSHOOT));
    // Dimension line + outward arrowheads at each end.
    pushSeg(dimPos, V(xL, yDim), V(xR, yDim));
    pushArrowTriangle(arrowPos, V(xL, yDim), X.clone().negate(), Y);
    pushArrowTriangle(arrowPos, V(xR, yDim), X, Y);
    valueLabels.push({
      text: String(Math.round(dims.baseLength * MM_PER_UNIT)),
      position: V(0, yDim + 0.22),
    });
  }

  // H — overall height, dimensioned to the RIGHT of the block on the front face.
  {
    const xDim = dims.halfLength + DIM_OFFSET;
    const yB = dims.baseBottomY;
    const yT = dims.topY;
    pushSeg(dimPos, V(dims.halfLength, yB), V(xDim + EXT_OVERSHOOT, yB));
    pushSeg(dimPos, V(dims.halfLength, yT), V(xDim + EXT_OVERSHOOT, yT));
    pushSeg(dimPos, V(xDim, yB), V(xDim, yT));
    pushArrowTriangle(arrowPos, V(xDim, yB), Y.clone().negate(), X);
    pushArrowTriangle(arrowPos, V(xDim, yT), Y, X);
    valueLabels.push({
      text: String(Math.round(dims.height * MM_PER_UNIT)),
      position: V(xDim + 0.3, (yB + yT) / 2),
      // The height value runs alongside a VERTICAL dimension line, so labelLayer rotates
      // it −90° in Aligned mode (BIS default) and leaves it horizontal in Unidirectional.
      isVertical: true,
    });
  }

  // Ø — bore diameter, dimensioned with a 45° leader out of the bore (the textbook
  // way to size a small hole): an arrowhead touching the rim, a leader line out, and
  // the Ø value at its end.
  {
    const a = Math.PI / 4; // 45° up-right
    const rimDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const rim = V(0, dims.axisY).add(rimDir.clone().multiplyScalar(dims.boreRadius));
    const out = V(0, dims.axisY).add(rimDir.clone().multiplyScalar(dims.bossRadius + 0.9));
    pushSeg(dimPos, rim, out);
    // Back-spread axis must lie IN the annotation plane (perpendicular to the leader,
    // not the Z axis) — with perp = +Z the filled triangle stands edge-on to the front
    // face and reads as a bare line instead of a wedge.
    const rimPerp = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
    pushArrowTriangle(arrowPos, rim, rimDir.clone().negate(), rimPerp);
    valueLabels.push({
      text: `Ø${Math.round(dims.boreDiameter * MM_PER_UNIT)}`,
      position: out.clone().add(new THREE.Vector3(0.45, 0.12, 0)),
    });
  }

  // --- Assemble the batches into one group. ----------------------------------
  const group = new THREE.Group();
  group.name = 'Bearing Block Annotations';

  const centreLine = buildSegments(centrePos, centreColor, WIDTH_PX.centre, resolution);
  const dimLine = buildSegments(dimPos, dimColor, WIDTH_PX.dimension, resolution);
  if (centreLine) {
    centreLine.visible = false; // revealed at Step 3
    group.add(centreLine);
  }
  if (dimLine) {
    dimLine.visible = false; // revealed at Step 4
    group.add(dimLine);
  }

  // Filled 3:1 arrowheads — a flat triangle soup in the annotation plane. MeshBasicMaterial
  // (unlit, flat ink) matches the Type B tone; DoubleSide keeps them solid from either orbit
  // side. Revealed with the dimension lines at Step 4.
  let arrowMesh = null;
  if (arrowPos.length) {
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute(arrowPos, 3));
    const arrowMat = new THREE.MeshBasicMaterial({ color: dimColor.getHex(), side: THREE.DoubleSide });
    arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.frustumCulled = false; // tiny geometry; avoids cull pop during orbit
    arrowMesh.visible = false;
    group.add(arrowMesh);
  }

  return {
    group,
    showCentreLines(v) { if (centreLine) centreLine.visible = v; },
    showDimensions(v) {
      if (dimLine) dimLine.visible = v;
      if (arrowMesh) arrowMesh.visible = v; // filled arrowheads ride with the dim lines
    },
    /** World anchors + text for the three dimension VALUES (rendered by labelLayer).
     *  `isVertical` flags a value that runs along a vertical dimension line, so labelLayer
     *  can rotate it in Aligned mode. */
    getDimensionValueLabels() {
      return valueLabels.map((l) => ({
        text: l.text,
        position: l.position.clone(),
        isVertical: !!l.isVertical,
      }));
    },
    /** Group-local anchor of the L (right) dimension arrowhead tip + the annotation-plane
     *  front normal — the micro-zoom target. main.js converts these to world space. */
    getArrowFocus() {
      return {
        position: V(dims.halfLength, dims.baseBottomY - DIM_OFFSET).clone(),
        normal: new THREE.Vector3(0, 0, 1),
      };
    },
    setResolution(w, h) {
      resolution.set(w, h);
      for (const line of [centreLine, dimLine]) {
        if (line && line.material instanceof LineMaterial) {
          line.material.resolution.copy(resolution);
        }
      }
    },
    dispose() {
      for (const line of [centreLine, dimLine]) {
        if (!line) continue;
        line.geometry?.dispose();
        line.material?.dispose();
        group.remove(line);
      }
      if (arrowMesh) {
        arrowMesh.geometry?.dispose();
        arrowMesh.material?.dispose();
        group.remove(arrowMesh);
      }
      group.parent?.remove(group);
    },
  };
}
