// Section drawing layer — the TRUE SHAPE auxiliary sheet and the per-view 45° section
// hatching (root DECISIONS.md ADR-060/061).
//
// Consumes the section result produced by src/sectionCut.js (the ordered boundary loops in
// both mesh-local 3D and plane (u,v) coordinates) and emits:
//
//   • trueShapeGroup — an in-scene drawing sheet, posed by the cutting plane's own
//     (u, v, normal) basis and offset along the normal into the cleared half-space. The
//     loop's points2D are drawn VERBATIM as local (x, y) world-unit geometry, so the true
//     shape is intrinsically 1:1 with the solid — there is no camera fit, framing, or
//     auto-zoom anywhere in this layer (ADR-038 sheet-locked lineage).
//   • hp/vp/ppHatchGroup — the sectioned surface hatched at 45° in each orthographic view
//     (the APPARENT shape), produced by projecting the loop with the same axis-drops
//     projectionDrawer.js uses (HP drops Y, VP drops X, PP drops Z at the consumer's z0).
//     A view where the cutting plane is edge-on projects the section to a line, not an
//     area — its hatch group is left empty (the drawing shows the trace, never a hatched
//     sliver).
//
// EXTRACTED vs INFERRED: the loop geometry is EXTRACTED (real cut geometry). The sheet
// placement and the hatch lines are INFERRED drawing constructions — nothing here feeds
// back into geometry or state.
//
// Layering (CLAUDE.md "Cross-cutting rules"): leaf module, sibling of projectionDrawer.js.
// Imports only THREE + the fat-line addons; it does NOT import the drawer, the analyzers,
// or main.js. Every line is LineMaterial + LineSegments2 (LineBasicMaterial is capped at
// 1px — CLAUDE.md), all solid, so no computeLineDistances is needed.
//
// LIFECYCLE: unlike projectionDrawer.js this module exports NO dispose() — the consumer
// parents every returned group inside shapeGroup, so rebuild()'s deep disposal contract
// (ADR-042) frees all geometry + materials automatically. setResolution must still be
// fanned out on resize (fat lines are resolution-dependent).

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded.
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);

/** A design token resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

// ============================================================================
// Drawing constants
// ============================================================================

/** Hatch pitch in WORLD units — 0.25 = 2.5 mm at the dock's 1 unit = 10 mm scale, the
 *  standard SP 46 section-lining density. Constant in sheet units on purpose: zooming
 *  magnifies the whole drawing uniformly (correct drafting semantics), and a bigger solid
 *  gets MORE lines at the same pitch, not a stretched pattern. */
export const HATCH_SPACING = 0.25;

/** Standard section-lining angle: 45° to the horizontal of each view. */
const HATCH_ANGLE = Math.PI / 4;

/** Below this projected polygon area (world units²) the section is edge-on in that view —
 *  it reads as a line (the cutting-plane trace), so no hatch is emitted. Sits well above
 *  the 1e-3 weld-lattice noise floor of a collapsed loop. */
const MIN_HATCH_AREA = 1e-3;

/** Line weights in CSS px (LineMaterial). Outline matches the drawer's visible weight. */
const OUTLINE_PX = 2.5;
const HATCH_PX = 1.2;

/** How far BEHIND each view's linework (along the view's observer axis) the hatch plane
 *  sits, so the drawer's solid/dashed lines always win the depth test over the hatching —
 *  and the wall grids (consumer-placed a further step back) never bleed through it. */
const VIEW_HATCH_LIFT = 0.003;

/** Local-Z separation of the true-shape sheet's layers: paper < hatch < outline. */
const SHEET_PAPER_Z = -0.006;
const SHEET_HATCH_Z = -0.003;

/** Paper margin around the true-shape loop, world units. */
const SHEET_MARGIN = 0.5;

/** 2D cross-product floor below which a loop vertex is collinear with its neighbours and
 *  is pruned FOR DISPLAY. sectionCut.js keeps collinear vertices deliberately (they are
 *  what welds the cap rim) — the pruning happens here, at draw time, per its contract. */
const COLLINEAR_EPS = 1e-5;

// ============================================================================
// 2D helpers
// ============================================================================

/** Absolute shoelace area of one 2D loop. */
function loopArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

/**
 * Drop collinear vertices from a closed loop (display only — see COLLINEAR_EPS).
 * @param {THREE.Vector2[]} pts
 * @returns {THREE.Vector2[]}
 */
function pruneCollinear(pts) {
  if (pts.length < 4) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i + pts.length - 1) % pts.length];
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (Math.abs(cross) > COLLINEAR_EPS) out.push(cur);
  }
  return out.length >= 3 ? out : pts;
}

/**
 * Clip a family of 45° parallel lines to a set of closed 2D loops (even-odd rule, all
 * loops pooled — a future hollow section's hole is skipped correctly for free). Every
 * current loop is convex, so each line yields one span; the general even-odd pairing is
 * kept anyway for robustness.
 *
 * @param {THREE.Vector2[][]} loops   Closed loops (first point not repeated).
 * @param {number} spacing           Perpendicular pitch between hatch lines.
 * @returns {number[]} Flat 2D segments [ax, ay, bx, by, …].
 */
function hatchLoops2D(loops, spacing) {
  const d = new THREE.Vector2(Math.cos(HATCH_ANGLE), Math.sin(HATCH_ANGLE));  // along a line
  const n = new THREE.Vector2(-d.y, d.x);                                      // line offset axis

  let minC = Infinity, maxC = -Infinity;
  for (const loop of loops) for (const p of loop) {
    const c = p.x * n.x + p.y * n.y;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  if (!(maxC > minC)) return [];

  const segs = [];
  const crossings = [];
  // Half-pitch inset at both ends so the first/last line never grazes a bare vertex.
  for (let c = minC + spacing / 2; c < maxC; c += spacing) {
    crossings.length = 0;
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const P = loop[i], Q = loop[(i + 1) % loop.length];
        const s1 = P.x * n.x + P.y * n.y - c;
        const s2 = Q.x * n.x + Q.y * n.y - c;
        // Half-open crossing rule: a vertex exactly on the line is counted consistently
        // on one side, so the even-odd parity never breaks on a grazed vertex.
        if ((s1 < 0) !== (s2 < 0)) {
          const t = s1 / (s1 - s2);
          const x = P.x + t * (Q.x - P.x);
          const y = P.y + t * (Q.y - P.y);
          crossings.push(x * d.x + y * d.y); // position ALONG the hatch line
        }
      }
    }
    crossings.sort((a, b) => a - b);
    const base = c; // line = { q : q·n = c }, parameterized q = c·n + t·d
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const t1 = crossings[k], t2 = crossings[k + 1];
      if (t2 - t1 < 1e-6) continue;
      segs.push(
        base * n.x + t1 * d.x, base * n.y + t1 * d.y,
        base * n.x + t2 * d.x, base * n.y + t2 * d.y,
      );
    }
  }
  return segs;
}

// ============================================================================
// Fat-line packing (local mirror of the drawer's buildSegments — leaf modules do
// not import each other, per the layering rule)
// ============================================================================

/**
 * Pack flat XYZ segment pairs into one LineSegments2, or null when empty. All lines in
 * this layer are SOLID (no dashes → no computeLineDistances needed).
 * @param {number[]} positions Flat [x,y,z, x,y,z, …], 6 floats per segment.
 * @param {THREE.Color} color
 * @param {number} linewidth CSS px.
 * @param {THREE.Vector2} resolution
 * @returns {LineSegments2 | null}
 */
function fatSegments(positions, color, linewidth, resolution) {
  if (positions.length === 0) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({ color: color.getHex(), linewidth });
  material.resolution.copy(resolution);
  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false; // tiny geometry, avoids cull pop during orbit
  return lines;
}

/** Map flat 2D segments into flat 3D segments through a per-point lift function. */
function segments2DTo3D(segs2, to3) {
  const out = [];
  for (let i = 0; i < segs2.length; i += 4) {
    const a = to3(segs2[i], segs2[i + 1]);
    const b = to3(segs2[i + 2], segs2[i + 3]);
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  return out;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * @typedef {Object} SectionViewResult
 * @property {THREE.Group} trueShapeGroup The auxiliary TRUE SHAPE sheet (paper + hatch +
 *   crimson outline), posed by the cutting plane's world basis. Reveal at the true-shape step.
 * @property {THREE.Group} hpHatchGroup 45° hatching of the apparent section in the TOP view.
 * @property {THREE.Group} vpHatchGroup … in the FRONT view (empty when the plane is edge-on there).
 * @property {THREE.Group} ppHatchGroup … in the SIDE view, drawn at world z = z0 (the PP wall).
 * @property {{centroid: THREE.Vector3, normal: THREE.Vector3}} worldFrame The section's
 *   world-space centroid + unit normal — the "Face the section" camera tween reads this.
 * @property {(w: number, h: number) => void} setResolution Push a new drawing-buffer size to
 *   every LineMaterial (call on resize). No dispose() — see the LIFECYCLE header note.
 */

/**
 * Build the true-shape sheet and the per-view section hatching for one cut result.
 *
 * @param {{loops: import('./sectionCut.js').SectionLoop[],
 *          basis: {origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, normal: THREE.Vector3}}} section
 *   The latest cut ({loops, basis}) from cutGeometryWithPlane — MESH-LOCAL space.
 * @param {THREE.Matrix4} matrixWorld The sliced mesh's local→world matrix (rigid).
 * @param {Object} options
 * @param {number} options.width        Drawing-buffer width (LineMaterial resolution).
 * @param {number} options.height       Drawing-buffer height.
 * @param {number} [options.z0=0]       PP wall standoff — the side view's world Z.
 * @param {number} [options.sheetOffset=2.5] Distance along the world normal from the section
 *   centroid to the true-shape sheet (the consumer computes it to clear the solid).
 * @returns {SectionViewResult}
 */
export function buildSectionViews(section, matrixWorld, options) {
  const { width, height, z0 = 0, sheetOffset = 2.5 } = options;
  const resolution = new THREE.Vector2(width, height);
  const sectionColor = cssColor('--color-section-face');

  // --- World-space loop + frame (basis vectors are directions: rotation only) ---------
  const worldLoops = section.loops.map((l) => l.points3D.map((p) => p.clone().applyMatrix4(matrixWorld)));
  const uW = section.basis.u.clone().transformDirection(matrixWorld);
  const vW = section.basis.v.clone().transformDirection(matrixWorld);
  const nW = section.basis.normal.clone().transformDirection(matrixWorld);
  const originW = section.basis.origin.clone().applyMatrix4(matrixWorld);

  const materials = [];
  const track = (obj) => { if (obj) materials.push(obj.material); return obj; };

  // --- Per-view apparent-section hatching ----------------------------------------------
  // Same axis-drops as projectionDrawer.js (projectHP / projectVP / projectPP), with the
  // hatch plane stepped VIEW_HATCH_LIFT behind the linework along each observer axis
  // (observers: HP from +Y, VP from +X, PP from +Z — the drawer's visibility conventions).
  const viewSpecs = [
    { name: 'hp', to2: (p) => new THREE.Vector2(p.x, p.z), to3: (x, y) => new THREE.Vector3(x, -VIEW_HATCH_LIFT, y) },
    { name: 'vp', to2: (p) => new THREE.Vector2(p.y, p.z), to3: (x, y) => new THREE.Vector3(-VIEW_HATCH_LIFT, x, y) },
    { name: 'pp', to2: (p) => new THREE.Vector2(p.x, p.y), to3: (x, y) => new THREE.Vector3(x, y, z0 - VIEW_HATCH_LIFT) },
  ];

  const hatchGroups = {};
  for (const spec of viewSpecs) {
    const group = new THREE.Group();
    group.name = `Section hatch (${spec.name.toUpperCase()})`;
    const loops2 = worldLoops.map((loop) => loop.map(spec.to2));
    const area = loops2.reduce((sum, l) => sum + loopArea(l), 0);
    if (area > MIN_HATCH_AREA) {
      const segs2 = hatchLoops2D(loops2, HATCH_SPACING);
      const lines = fatSegments(segments2DTo3D(segs2, spec.to3), sectionColor, HATCH_PX, resolution);
      if (lines) group.add(track(lines));
    }
    hatchGroups[spec.name] = group;
  }

  // --- The TRUE SHAPE sheet -------------------------------------------------------------
  // Local (x, y) ≡ the plane's (u, v): the group's quaternion comes straight from the world
  // basis, and points2D are drawn verbatim — 1:1 world scale, nothing fitted or zoomed.
  const trueShapeGroup = new THREE.Group();
  trueShapeGroup.name = 'True Shape';
  trueShapeGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(uW, vW, nW));
  trueShapeGroup.position.copy(originW).addScaledVector(nW, sheetOffset);

  const loops2D = section.loops.map((l) => l.points2D);

  // Paper backing sized to the loop extents + margin, so the figure reads as a drawing card.
  const bbox = new THREE.Box2();
  for (const loop of loops2D) for (const p of loop) bbox.expandByPoint(p);
  const size = bbox.getSize(new THREE.Vector2());
  const center = bbox.getCenter(new THREE.Vector2());
  const paperGeo = new THREE.PlaneGeometry(size.x + 2 * SHEET_MARGIN, size.y + 2 * SHEET_MARGIN);
  const paper = new THREE.Mesh(paperGeo, new THREE.MeshBasicMaterial({
    color: cssColor('--color-paper'),
    side: THREE.DoubleSide,
  }));
  paper.position.set(center.x, center.y, SHEET_PAPER_Z);
  trueShapeGroup.add(track(paper));
  // Hairline paper border — instrument chrome, not engineering linework, so 1px is fine
  // (the same rule as the cutting-plane quad border in main.js).
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(paperGeo),
    new THREE.LineBasicMaterial({ color: cssColor('--color-border') }),
  );
  border.position.copy(paper.position);
  trueShapeGroup.add(track(border));

  // 45° section lining across the true shape (drawn from the SAME loops the outline uses).
  const sheetHatch2 = hatchLoops2D(loops2D, HATCH_SPACING);
  const sheetHatch = fatSegments(
    segments2DTo3D(sheetHatch2, (x, y) => new THREE.Vector3(x, y, SHEET_HATCH_Z)),
    sectionColor, HATCH_PX, resolution,
  );
  if (sheetHatch) trueShapeGroup.add(track(sheetHatch));

  // The crimson true-shape outline — collinear rim-weld vertices pruned for display.
  const outlinePos = [];
  for (const loop of loops2D) {
    const pts = pruneCollinear(loop);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      outlinePos.push(a.x, a.y, 0, b.x, b.y, 0);
    }
  }
  const outline = fatSegments(outlinePos, sectionColor, OUTLINE_PX, resolution);
  if (outline) trueShapeGroup.add(track(outline));

  return {
    trueShapeGroup,
    hpHatchGroup: hatchGroups.hp,
    vpHatchGroup: hatchGroups.vp,
    ppHatchGroup: hatchGroups.pp,
    worldFrame: { centroid: originW, normal: nW },
    setResolution(w, h) {
      resolution.set(w, h);
      for (const mat of materials) {
        if (mat instanceof LineMaterial) mat.resolution.copy(resolution);
      }
    },
  };
}
