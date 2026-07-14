// Glass Box geometry layer — the three reference planes + the flat 2D views cast onto them.
//
// Builds the HP / VP / PP reference planes as GRID MATRICES with thick borders (no glass fill),
// each carrying its CSS2D name pill ("HP"/"VP"/"PP"), and casts the object's orthographic views
// onto them: each pane displays ONLY its exact 2D drawing outline, constructed segment-by-segment
// from the Bearing Block's dimension table (Phase-2/3 QA polish — the dashed bounding-box
// projector rays are gone, and no EdgesGeometry extraction is involved).
//
// Layering (CLAUDE.md "Cross-cutting rules"): this is a LEAF layer. It imports only THREE + the
// fat-line/CSS2D addons; it does NOT import main.js, the stepper, or any sibling leaf. main.js
// (the orchestrator) calls createGlassBox() + castProjectors() inside its single rebuild() pipeline
// and adds the returned groups to the scene.
//
// FIRST-ANGLE ORIENTATION (ADR-044, fold path revised by ADR-049). The three panes form an
// EXPLODED corner box: each pane spans [−half, half] in-plane but sits at `offset` (> half) on its
// normal axis, so the panes never share vertices and a visible air gap separates their edges:
//   • HP (teal)   — floor,      y = −offset → Top view, unfolds DOWN (below Front)
//   • VP (amber)  — back wall,  z = −offset → Front view, stays FIXED
//   • PP (violet) — RIGHT wall, x = +offset → Side view, folds DOWN onto the HP (ADR-049, matching
//     Module 2's PP_FOLD_TARGET) so it lands BESIDE THE TOP VIEW in the flat layout.
// The object is viewed from −X to cast the Side view onto the PP at +X.
//
// FAT LINES (CLAUDE.md, non-negotiable). Standard LineBasicMaterial is capped at 1px on most GPUs,
// so every line here is a LineSegments2 + LineMaterial (the addons that fatten lines in a shader).
// LineMaterial MUST know the drawing-buffer resolution or it renders the wrong width — main.js
// pushes it in at build time and again on every resize (updateLineResolution).
//
// DISPOSAL: these builders only CREATE. Teardown is owned by main.js's rebuild(), whose deep
// disposal traversal walks every descendant of shapeGroup and frees each geometry + material —
// and pulls each CSS2D label's DOM node out of the overlay (RULES.md §3.5) — so
// renderer.info.memory stays flat and the overlay never accumulates nodes across rebuilds.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded
// (DESIGN.md single source of truth). Each leaf reads its own tokens.
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);

/** Resolve a CSS custom property to a THREE.Color (tokens are sRGB hex, which THREE parses). */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

// ============================================================================
// Visual-style constants
// ============================================================================

const GRID_PX = 1.0;       // the calm grid-matrix lines drawn across each pane
const GRID_OPACITY = 0.30; // faint enough to read as graph-paper glass, never competing with ink
const BORDER_PX = 2.6;     // the thick pane-border frame (LineSegments2)
const VIEW_VISIBLE_PX = 2.5; // Two-Weight Rule — matches Module2 LINE_WIDTH_PX.visible
const VIEW_HIDDEN_PX = 1.5;  // hidden/occluded edges recede — LINE_WIDTH_PX.hidden
const GRID_DIV = 12;       // grid divisions per pane (a 12×12 calm matrix)

/** Dash geometry (world units) for makeFatSegments' generic dashed option, tuned to the box scale. */
const DASH = Object.freeze({ size: 0.16, gap: 0.11 });

// ============================================================================
// Fat-line factory — shared by main.js (block edges, sight lines, observer) too.
// ============================================================================

/**
 * Build one fattened-line object (LineSegments2 + LineMaterial) from a flat `[x,y,z, …]` buffer,
 * where each consecutive pair of points is one disjoint segment. This is the single fat-line
 * primitive; main.js reuses it for the block's box outline, the observer, and the sight lines.
 *
 * @param {number[]}      positions   Flat XYZ pairs (6 floats per segment).
 * @param {THREE.Color}   color       Line colour (a resolved token).
 * @param {number}        linewidthPx Width in CSS pixels.
 * @param {{ dashed?: boolean, opacity?: number }} [opts]
 * @param {THREE.Vector2} [resolution] Drawing-buffer size; LineMaterial needs it for correct width.
 * @returns {LineSegments2}
 */
export function makeFatSegments(positions, color, linewidthPx, opts = {}, resolution) {
  const { dashed = false, opacity = 1 } = opts;

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  const material = new LineMaterial({
    color: color.getHex(),
    linewidth: linewidthPx,
    dashed,
    dashSize: DASH.size,
    gapSize: DASH.gap,
    transparent: opacity < 1,
    opacity,
  });
  if (resolution) material.resolution.copy(resolution);

  const segments = new LineSegments2(geometry, material);
  // A dashed LineMaterial renders solid unless per-vertex line distances exist; for LineSegments2
  // the distance resets each segment so dashes stay phase-consistent (CLAUDE.md).
  if (dashed) segments.computeLineDistances();
  segments.frustumCulled = false; // small geometry — avoid cull pop during orbit
  return segments;
}

// ============================================================================
// Grid-matrix builder — world-baked segment endpoints for one pane's calm grid.
// (World-baked, like the borders, so the fold's inner-offset trick rotates them
//  about the hinge line with no geometry recompute — see main.js assembleScene.)
// ============================================================================

/**
 * Flat XYZ buffer of grid lines spanning one pane, in WORLD coordinates. The pane sits at `D` on
 * its normal axis (the exploded offset, > H) and spans [−H, H] on its two in-plane axes — the
 * D − H surplus is the visible air gap that keeps the three panes from sharing vertices (ADR-049).
 *
 * @param {'hp'|'vp'|'pp'} plane
 * @param {number} H  In-plane half-span.
 * @param {number} D  Normal-axis offset (HP y=−D, VP z=−D, PP x=+D).
 * @param {number} div Number of divisions.
 * @returns {number[]}
 */
function gridPositions(plane, H, D, div) {
  const step = (2 * H) / div;
  const pos = [];
  const seg = (ax, ay, az, bx, by, bz) => pos.push(ax, ay, az, bx, by, bz);

  for (let i = 0; i <= div; i++) {
    const t = -H + i * step;
    if (plane === 'hp') {          // floor y = −D, spans x & z
      seg(t, -D, -H, t, -D, H);    // const x, run z
      seg(-H, -D, t, H, -D, t);    // const z, run x
    } else if (plane === 'vp') {   // back wall z = −D, spans x & y
      seg(t, -H, -D, t, H, -D);    // const x, run y
      seg(-H, t, -D, H, t, -D);    // const y, run x
    } else {                       // side wall x = +D, spans y & z
      seg(D, t, -H, D, t, H);      // const y, run z
      seg(D, -H, t, D, H, t);      // const z, run y
    }
  }
  return pos;
}

/**
 * Build one CSS2D plane-name pill ("HP" / "VP" / "PP") themed from its plane's domain hue (the
 * .plane-label--* classes in index.html, same convention as Module 2). The element starts at
 * opacity 0 — main.js's plane-reveal drives both the element opacity AND the object's own
 * `.visible` (the r160 CSS2DRenderer ignores ancestor visibility, so the object flag must be set
 * directly). The DOM node is pulled from the overlay by main.js's disposal traversal (§3.5).
 * @param {string} text  Label text, e.g. 'HP'.
 * @param {'hp'|'vp'|'pp'} plane  Hue modifier + fold re-parent tag.
 * @returns {CSS2DObject}
 */
function makePlaneLabel(text, plane) {
  const el = document.createElement('div');
  el.className = `plane-label plane-label--${plane}`;
  el.textContent = text;
  el.style.opacity = '0'; // revealed by the Step-2 plane fade (main.js applyPlaneOpacity)
  const label = new CSS2DObject(el);
  label.name = `${text} label`;
  label.userData.plane = plane; // fold re-parent tag (main.js routes it onto the pane's hinge)
  label.userData.role = 'label';
  label.visible = false;
  return label;
}

// ============================================================================
// The glass box — three reference planes rendered as grid matrices + borders
// ============================================================================

/**
 * Build the three reference planes as calm GRID MATRICES with thick borders (ADR-044 supersedes
 * ADR-043's hue-tinted glass fill), EXPLODED away from the origin (ADR-049): each pane spans
 * [−half, half] in-plane but sits at `offset` (> half) on its normal axis — HP floor (y=−offset,
 * teal), VP back wall (z=−offset, amber), PP RIGHT wall (x=+offset, violet) — so the panes never
 * share vertices and a visible air gap separates their edges. Each pane carries a `userData.plane`
 * tag so main.js can re-parent it onto its fold-hinge pivot (grid + border + label ride together),
 * and a CSS2D name pill ("HP"/"VP"/"PP") on its outer edge.
 *
 * @param {{ half: number, offset: number, divisions?: number, resolution?: THREE.Vector2 }} cfg
 * @returns {THREE.Group} Add THIS to the scene; teardown is main.js's deep disposal traversal.
 */
export function createGlassBox({ half, offset, divisions = GRID_DIV, resolution }) {
  const H = half;
  const D = offset;
  const group = new THREE.Group();
  group.name = 'Glass Box';

  // Per-pane spec: the fold-tag, its hue token, the 4 corner points of its border rectangle
  // (world space, at the exploded offset D), and where its CSS2D name pill sits (an outer edge
  // midpoint, clear of the cast view outlines). PP sits on +X (ADR-044).
  const panes = [
    {
      plane: 'hp', token: '--color-hp-line', labelAt: [0, -D, H],
      rect: [[-H, -D, -H], [H, -D, -H], [H, -D, H], [-H, -D, H]], // HP floor (XZ), y = −D
    },
    {
      plane: 'vp', token: '--color-vp-line', labelAt: [0, H, -D],
      rect: [[-H, -H, -D], [H, -H, -D], [H, H, -D], [-H, H, -D]], // VP back wall (XY), z = −D
    },
    {
      plane: 'pp', token: '--color-pp-line', labelAt: [D, H, 0],
      rect: [[D, -H, -H], [D, H, -H], [D, H, H], [D, -H, H]],     // PP right wall (YZ), x = +D
    },
  ];

  for (const pane of panes) {
    const hue = cssColor(pane.token);

    // Calm grid matrix (faint same-hue lines — the graph-paper glass).
    const grid = makeFatSegments(
      gridPositions(pane.plane, H, D, divisions), hue, GRID_PX, { dashed: false, opacity: GRID_OPACITY }, resolution,
    );
    grid.userData.plane = pane.plane; // fold re-parent tag (main.js)
    grid.userData.role = 'grid';
    group.add(grid);

    // Thick same-hue border rectangle (4 edges → 4 disjoint segments).
    const borderPos = [];
    for (let i = 0; i < 4; i++) {
      const a = pane.rect[i];
      const b = pane.rect[(i + 1) % 4];
      borderPos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const border = makeFatSegments(borderPos, hue, BORDER_PX, { dashed: false }, resolution);
    border.userData.plane = pane.plane; // fold re-parent tag (main.js)
    border.userData.role = 'border';
    group.add(border);

    // CSS2D name pill on the pane's outer edge; rides the pane's fold hinge like the grid/border.
    const label = makePlaneLabel(pane.plane.toUpperCase(), pane.plane);
    label.position.set(pane.labelAt[0], pane.labelAt[1], pane.labelAt[2]);
    group.add(label);
  }

  group.userData.half = H;
  group.userData.offset = D;
  return group;
}

// ============================================================================
// Orthographic views — exact 2D drawings constructed from the block's
// dimension table (Phase-3 QA polish supersedes the amended ADR-046 pipeline)
// ============================================================================

/** Chord count for the Front view's dome semicircle — smooth at viewport scale while staying a
 *  lightweight polyline. */
const ARC_SEGMENTS = 32;

/** Chord count for a full hole circle (bore rim / mount holes) — smooth at viewport scale while
 *  staying a lightweight polyline. */
const HOLE_SEGMENTS = 48;

/**
 * Push a full circle (centre `cx,cy` in the view's 2-arg plane coords, radius `r`) as
 * `HOLE_SEGMENTS` chords via the view's own `seg(a1,b1,a2,b2)` pusher (e.g. `hpSeg`/`vpSeg`/
 * `ppSeg`) — used for the bore rim and the mounting-hole rims, whichever view sees them as a
 * true circle (the axis runs normal to that view's plane).
 * @param {(a1:number,b1:number,a2:number,b2:number)=>void} seg
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function circleInto(seg, cx, cy, r) {
  for (let i = 0; i < HOLE_SEGMENTS; i++) {
    const t1 = (i / HOLE_SEGMENTS) * Math.PI * 2;
    const t2 = ((i + 1) / HOLE_SEGMENTS) * Math.PI * 2;
    seg(cx + r * Math.cos(t1), cy + r * Math.sin(t1), cx + r * Math.cos(t2), cy + r * Math.sin(t2));
  }
}

/**
 * Cast the object's orthographic views onto the three panes as EXACT 2D drawings, constructed
 * segment-by-segment from the Bearing Block's dimension table (world-scaled by main.js) — no
 * EdgesGeometry extraction, no per-segment projection or seam filters. Each view is authored the
 * way a draughtsman would draw it, so no false seams or open outlines can occur, and each view's
 * hole features are drawn VISIBLE where the hole's axis is normal to that view's plane (a true
 * circle) and HIDDEN (dashed) otherwise (the axis runs IN-plane, so the hole reads as two edges):
 *   • Front view (VP, z = −D): base rectangle SPLIT at the base/body junction into two shelf
 *     segments — the base and body share the full block depth, so their front faces are flush and
 *     NO edge crosses the central span (|x| < halfBody); drawing one there would be false. Body
 *     sides up to the dome spring line + the dome semicircle (tangent, so no spring-line edge).
 *     The bore (axis Z, normal to this plane) is a VISIBLE circle; the two mounting holes (axis Y,
 *     in-plane) are HIDDEN verticals at their rim x-offsets.
 *   • Top view (HP, y = −D): base outer rectangle + the body's two longitudinal edges (its front/
 *     back edges coincide with the base rectangle — not re-drawn). The mounting holes (axis Y,
 *     normal to this plane) are VISIBLE circles; the bore (axis Z, in-plane) is HIDDEN verticals.
 *   • Side view (PP, x = +D): ONE seamless outer rectangle from foot bottom to dome top (base,
 *     body and dome share the full block depth, so their union has no interior seam), PLUS the
 *     base-shelf's top edge — the base sticks out laterally past the narrower body, so its top
 *     face forms a real physical corner and must be drawn across the profile. Both holes' axes run
 *     in-plane here, so bore and mounting holes are HIDDEN horizontals/verticals.
 *
 * Each visible view is tagged per plane so main.js can toggle "only this view" in Step 3 and
 * re-parent each outline onto its pane's fold-hinge pivot; its hidden (dashed) linework is nested
 * as a CHILD of the visible object (untagged) so it rides the same `.visible` gate, the same fold
 * hinge, and the same disposal/resolution traversals with no changes needed elsewhere. The dashed
 * bounding-box projector rays are GONE (Phase-2 QA purge) — only the 2D drawing outlines remain.
 *
 * @param {Object} args
 * @param {number} args.offset  The exploded pane offset (HP y=−offset, VP z=−offset, PP x=+offset).
 * @param {THREE.Vector2} args.resolution  Drawing-buffer size for the LineMaterials.
 * @param {Object} args.dims  Bearing Block dimensions in WORLD units (BEARING_BLOCK_DIMS ×
 *   BLOCK_SCALE — main.js computes them; this leaf never imports the generator, ADR-007 star rule):
 * @param {number} args.dims.halfLength   Base half-length (X).
 * @param {number} args.dims.halfDepth    Block half-depth (Z — base and body share it).
 * @param {number} args.dims.halfBody     Body half-width (X) — equals the boss radius (tangent dome).
 * @param {number} args.dims.baseBottomY  Foot underside.
 * @param {number} args.dims.baseTopY     Top of the foot slab (the base/body junction).
 * @param {number} args.dims.axisY        Bore/boss axis height — the dome spring line.
 * @param {number} args.dims.topY         Top of the dome.
 * @param {number} args.dims.boreRadius   Horizontal through-bore radius (axis Z).
 * @param {number} args.dims.mountRadius  Vertical mounting-hole radius (axis Y).
 * @param {number[]} args.dims.mountX     [-x, +x] mounting-hole centres.
 * @returns {THREE.Group} with `userData.views = { hp, vp, pp }`.
 */
export function castProjectors({ offset, resolution, dims }) {
  const D = offset;
  const {
    halfLength, halfDepth, halfBody, baseBottomY, baseTopY, axisY, topY,
    boreRadius, mountRadius, mountX,
  } = dims;
  const group = new THREE.Group();
  group.name = 'Cast Views';

  // ── Top view (HP floor, y = −D; in-plane coords are world x/z) ──────────────────────────────
  const hpView = [];
  const hpSeg = (x1, z1, x2, z2) => hpView.push(x1, -D, z1, x2, -D, z2);
  hpSeg(-halfLength, -halfDepth, halfLength, -halfDepth); // base outer rectangle
  hpSeg(halfLength, -halfDepth, halfLength, halfDepth);
  hpSeg(halfLength, halfDepth, -halfLength, halfDepth);
  hpSeg(-halfLength, halfDepth, -halfLength, -halfDepth);
  hpSeg(-halfBody, -halfDepth, -halfBody, halfDepth);     // central body — its two longitudinal
  hpSeg(halfBody, -halfDepth, halfBody, halfDepth);       // edges (front/back sit on the base rect)
  // Mounting holes: axis Y is normal to the HP plane, so each hole reads as a true VISIBLE circle.
  for (const mx of mountX) circleInto(hpSeg, mx, 0, mountRadius);

  const hpHiddenView = [];
  const hpHidSeg = (x1, z1, x2, z2) => hpHiddenView.push(x1, -D, z1, x2, -D, z2);
  // Bore: axis Z is in-plane here, so it reads as two HIDDEN walls at x = ±boreRadius.
  hpHidSeg(-boreRadius, -halfDepth, -boreRadius, halfDepth);
  hpHidSeg(boreRadius, -halfDepth, boreRadius, halfDepth);

  // ── Front view (VP back wall, z = −D; in-plane coords are world x/y) ────────────────────────
  const vpView = [];
  const vpSeg = (x1, y1, x2, y2) => vpView.push(x1, y1, -D, x2, y2, -D);
  vpSeg(-halfLength, baseBottomY, halfLength, baseBottomY); // base bottom edge
  vpSeg(halfLength, baseBottomY, halfLength, baseTopY);     // base right side
  vpSeg(-halfLength, baseTopY, -halfLength, baseBottomY);   // base left side
  // Base/body front faces are FLUSH (both share halfDepth) — no edge crosses the central span.
  // Only the two shelf segments outside the body are real:
  vpSeg(-halfLength, baseTopY, -halfBody, baseTopY);        // left shelf
  vpSeg(halfBody, baseTopY, halfLength, baseTopY);           // right shelf
  vpSeg(-halfBody, baseTopY, -halfBody, axisY);             // body sides, foot top → spring line
  vpSeg(halfBody, baseTopY, halfBody, axisY);
  // Dome semicircle: centre (0, axisY), radius halfBody, chordised from the right spring point
  // over the apex to the left. Tangent to the body sides, so no spring-line edge is drawn.
  for (let i = 0; i < ARC_SEGMENTS; i++) {
    const t1 = (i / ARC_SEGMENTS) * Math.PI;
    const t2 = ((i + 1) / ARC_SEGMENTS) * Math.PI;
    vpSeg(halfBody * Math.cos(t1), axisY + halfBody * Math.sin(t1),
          halfBody * Math.cos(t2), axisY + halfBody * Math.sin(t2));
  }
  // Bore: axis Z is normal to the VP plane, so it reads as a true VISIBLE circle.
  circleInto(vpSeg, 0, axisY, boreRadius);

  const vpHiddenView = [];
  const vpHidSeg = (x1, y1, x2, y2) => vpHiddenView.push(x1, y1, -D, x2, y2, -D);
  // Mounting holes: axis Y is in-plane here, so each reads as two HIDDEN verticals at its rim.
  for (const mx of mountX) {
    vpHidSeg(mx - mountRadius, baseBottomY, mx - mountRadius, baseTopY);
    vpHidSeg(mx + mountRadius, baseBottomY, mx + mountRadius, baseTopY);
  }

  // ── Side view (PP right wall, x = +D; in-plane coords are world y/z) ────────────────────────
  const ppView = [];
  const ppSeg = (y1, z1, y2, z2) => ppView.push(D, y1, z1, D, y2, z2);
  ppSeg(baseBottomY, -halfDepth, baseBottomY, halfDepth); // one outer rectangle, foot → dome top
  ppSeg(baseBottomY, halfDepth, topY, halfDepth);
  ppSeg(topY, halfDepth, topY, -halfDepth);
  ppSeg(topY, -halfDepth, baseBottomY, -halfDepth);
  // Base shelf: the base sticks out laterally past the narrower body, so its top face forms a
  // real physical corner — a visible edge across the full depth at the base/body junction height.
  ppSeg(baseTopY, -halfDepth, baseTopY, halfDepth);

  const ppHiddenView = [];
  const ppHidSeg = (y1, z1, y2, z2) => ppHiddenView.push(D, y1, z1, D, y2, z2);
  // Bore: axis Z is in-plane here, so it reads as two HIDDEN walls at y = axisY ± boreRadius.
  ppHidSeg(axisY - boreRadius, -halfDepth, axisY - boreRadius, halfDepth);
  ppHidSeg(axisY + boreRadius, -halfDepth, axisY + boreRadius, halfDepth);
  // Mounting holes: axis Y is in-plane here too, so each reads as two HIDDEN verticals at its rim.
  ppHidSeg(baseBottomY, -mountRadius, baseTopY, -mountRadius);
  ppHidSeg(baseBottomY, mountRadius, baseTopY, mountRadius);

  const hpOut = makeFatSegments(hpView, cssColor('--color-hp-line'), VIEW_VISIBLE_PX, { dashed: false }, resolution);
  const vpOut = makeFatSegments(vpView, cssColor('--color-vp-line'), VIEW_VISIBLE_PX, { dashed: false }, resolution);
  const ppOut = makeFatSegments(ppView, cssColor('--color-pp-line'), VIEW_VISIBLE_PX, { dashed: false }, resolution);
  hpOut.userData.plane = 'hp'; hpOut.userData.role = 'view';
  vpOut.userData.plane = 'vp'; vpOut.userData.role = 'view';
  ppOut.userData.plane = 'pp'; ppOut.userData.role = 'view';

  // Hidden (dashed) linework nests as a CHILD of its visible view object — inherits the same
  // .visible gate (Step 3/4 toggling, applyStepGating), rides the same fold hinge (re-parented as
  // a unit by assembleScene's route(), which only reads the PARENT's userData.plane), and is
  // reached by rebuild()'s deep-disposal traversal and updateLineResolution's walker. Left
  // untagged (no userData.plane/role) so assembleScene's per-plane routing never sees it directly.
  hpOut.add(makeFatSegments(hpHiddenView, cssColor('--color-hp-line'), VIEW_HIDDEN_PX, { dashed: true }, resolution));
  vpOut.add(makeFatSegments(vpHiddenView, cssColor('--color-vp-line'), VIEW_HIDDEN_PX, { dashed: true }, resolution));
  ppOut.add(makeFatSegments(ppHiddenView, cssColor('--color-pp-line'), VIEW_HIDDEN_PX, { dashed: true }, resolution));

  group.add(hpOut, vpOut, ppOut);

  group.userData.views = { hp: hpOut, vp: vpOut, pp: ppOut };
  return group;
}
