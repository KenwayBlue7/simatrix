// The dimension layer on the SOLID — the same sizes the drawing carries, drawn on the object.
//
// WHY THIS EXISTS. Step 1 asks the learner to look at a machine part; the textbook prints that part
// with its sizes on it. Without them the learner has no way to check that the thing they are
// orbiting is the thing in the book — which is the one question a modelled object has to be able to
// answer. Step 2's sheet already carries every size, but that is the drawing, and the drawing is
// what Step 1 has not reached yet.
//
// IT REUSES THE SHEET'S DATA, NOT ITS CODE. Every dimension here is the SAME entry from
// `objectData.dims` that `projectionSheet.js` draws on paper, read straight out of the view frame it
// was authored in and lifted onto the corresponding face of the solid. So there is exactly one
// dimension set per object; the two renderers are two media for it, and the sheet's proven
// non-overlapping lane layout comes along for free. The BIS geometry they share
// (`DIM_STYLE`) lives in the data module for the same reason.
//
// THE FRAMES are `objectData.js`'s, unchanged. Each 2-D view frame is a plane of the solid:
//
//   ELEVATION  local (x, y)  ->  world (x, y, +zFace)      the face the front view is taken of
//   PLAN       local (x, y)  ->  world (x, yFace, -y)      the top face
//   RIGHT SIDE local (x, y)  ->  world (+xFace, y, -x)     the right-hand face
//   LEFT SIDE  local (x, y)  ->  world (-xFace, y, +x)     the left-hand face
//
// Those mappings are the frame note in `objectData.js` read backwards, and they are the only place
// this file knows anything about first angle.
//
// ONE VIEW AT A TIME. All forty-three dimensions at once would bury the solid, so the layer draws
// the set belonging to the direction the camera is actually at — which is also the set whose plane
// is facing the learner, so it reads flat and square rather than foreshortened into noise.
//
// ARROWHEADS are the OPEN 3:1 chevron, not the sheet's filled triangle: a filled head needs a Mesh
// and would break the single-`LineSegments2` disposal contract this layer is built on
// (RULES.md §6.19, the same reason `Module2/src/projectionDrawer.js` gives).
//
// Layering (CLAUDE.md): leaf module. Imports THREE, the fat-line addons, CSS2D, the pure-data
// `objectData.js` and the stateless `tokens.js` (RULES.md §3.6a) — never a behaviour leaf.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { toWorld, DIM_STYLE, alignedDim } from './objectData.js';
import { roleColor, WEIGHT } from './tokens.js';

/**
 * Clear space between the solid's face and the plane its dimensions are drawn on, in mm.
 *
 * A dimension is annotation, so it stands off the material rather than lying on it — the same
 * reason a drawn dimension line never touches the outline it measures. Enough that the extension
 * lines read as separate strokes from the edges they spring from at every orbit angle.
 */
const FACE_GAP = 10;

/** Half-width of a 3:1 arrowhead. */
const ARROW_HALF = DIM_STYLE.arrow / 6;

/**
 * Build the local-frame placement for one view: a point mapper and the plane it draws on.
 *
 * @param {'front'|'top'|'side'} view
 * @param {'left'|'right'} sideView  Which side view the topic is currently showing.
 * @param {THREE.Box3} box           The solid's bounds in its OWN (pre-centred) frame, world units.
 */
function framePlacement(view, sideView, box) {
  const gap = toWorld(FACE_GAP);
  if (view === 'top') {
    const y = box.max.y + gap;
    return (u, v) => new THREE.Vector3(toWorld(u), y, -toWorld(v));
  }
  if (view === 'side') {
    if (sideView === 'left') {
      const x = box.min.x - gap;
      return (u, v) => new THREE.Vector3(x, toWorld(v), toWorld(u));
    }
    const x = box.max.x + gap;
    return (u, v) => new THREE.Vector3(x, toWorld(v), -toWorld(u));
  }
  const z = box.max.z + gap;
  return (u, v) => new THREE.Vector3(toWorld(u), toWorld(v), z);
}

/**
 * Build the dimension layer for one view of one object.
 *
 * @param {object} data                An entry from `OBJECTS`.
 * @param {'front'|'top'|'side'} view  Which view's dimension set to draw.
 * @param {'left'|'right'} sideView    The topic's live side-view choice.
 * @param {THREE.Box3} box             The solid's bounds in its own frame.
 * @param {THREE.Vector2} resolution   Drawing-buffer size for `LineMaterial`.
 * @returns {{ group: THREE.Group, setResolution: (w:number,h:number)=>void, dispose: () => void }}
 */
export function buildDimensions3D(data, view, sideView, box, resolution) {
  const group = new THREE.Group();
  const at = framePlacement(view, sideView, box);
  const labels = [];
  const segments = [];

  // Both side views are authored in the RIGHT side view's frame; asking for the left one mirrors
  // it, exactly as the sheet does, so one authored set serves both faces.
  const mirror = view === 'side' && sideView !== data.sideView;
  const fx = (pt) => (mirror ? [-pt[0], pt[1]] : pt);

  const material = new LineMaterial({
    color: roleColor('dimension'),
    linewidth: WEIGHT.dimension,
    transparent: true,
    opacity: 1,
    // Annotation reads THROUGH the part. A dimension line is not a feature of the object competing
    // for depth with it — half an arrowhead swallowed by a boss is a dimension the learner cannot
    // check, and the values (CSS2D) are never occluded anyway, so depth-testing the linework only
    // makes the two halves of one mark disagree. The same reasoning RULES.md §3.38 applies to a
    // concealed centre line.
    depthTest: false,
  });
  material.resolution.copy(resolution);

  /** Push a segment between two points of the view's own 2-D frame. */
  const seg = (a, b) => {
    const p = at(a[0], a[1]);
    const q = at(b[0], b[1]);
    segments.push(p.x, p.y, p.z, q.x, q.y, q.z);
  };

  /**
   * A live DOM value at a point of the frame, turned through `rotationDeg` for Method 1.
   *
   * CSS2DRenderer owns the OUTER element's transform — it parks the node in screen space every
   * frame — so the turn has to live on an INNER span or the next frame wipes it. That is the
   * benchmark topic's `.vp-value` / `.vp-value__text` pairing, for the same reason.
   *
   * The angle is the view frame's, negated: the frame's y runs UP and the screen's runs DOWN.
   * It is a constant rather than a per-frame reprojection because this layer is only ever drawn
   * for the direction the camera is AT, and at each of the four principal directions the view's
   * own frame lands on the screen square — local +x to the right, local +y up, no rotation. In
   * free orbit the whole set foreshortens together and the value rides its plane, which is what
   * the sheet's values do too.
   */
  const value = (p, text, cls = 'vp-dim', rotationDeg = 0) => {
    const el = document.createElement('span');
    el.className = cls;
    const inner = document.createElement('span');
    inner.className = 'vp-dim__text';
    inner.textContent = text;
    if (rotationDeg) inner.style.transform = `rotate(${-rotationDeg}deg)`;
    el.appendChild(inner);
    const node = new CSS2DObject(el);
    node.position.copy(at(p[0], p[1]));
    group.add(node);
    labels.push({ node, el });
  };

  /**
   * An open 3:1 chevron whose point is at `tip`, opening back along `u` (a unit vector of the
   * view's own frame). Two strokes, so the whole layer stays one `LineSegments2`.
   */
  const arrowHead = (tip, u) => {
    const n = [-u[1], u[0]];
    const back = [tip[0] - u[0] * DIM_STYLE.arrow, tip[1] - u[1] * DIM_STYLE.arrow];
    seg(tip, [back[0] + n[0] * ARROW_HALF, back[1] + n[1] * ARROW_HALF]);
    seg(tip, [back[0] - n[0] * ARROW_HALF, back[1] - n[1] * ARROW_HALF]);
  };

  /**
   * One aligned linear dimension: two extension lines, a dimension line, two heads, one value.
   * The placement is `alignedDim()`'s — the SAME function the sheet lays out with, so a size
   * reads the same way on the solid as it does on the paper it is about to be drawn on.
   */
  const linear = (d0) => {
    const d = mirror ? { ...d0, a: fx(d0.a), b: fx(d0.b), off: -d0.off } : d0;
    const { u, n, s, A, B, angle, textAt } = alignedDim(d);

    for (const [p, P] of [[d.a, A], [d.b, B]]) {
      seg(
        [p[0] + n[0] * s * DIM_STYLE.extGap, p[1] + n[1] * s * DIM_STYLE.extGap],
        [P[0] + n[0] * s * DIM_STYLE.extOver, P[1] + n[1] * s * DIM_STYLE.extOver],
      );
    }
    seg(A, B);
    arrowHead(A, [-u[0], -u[1]]);
    arrowHead(B, u);
    value(textAt, d.text, 'vp-dim', angle);
  };

  /**
   * A leader: a sloping leg off the feature, a short landing, the note above it.
   *
   * The note stays LEVEL, and that is not a lapse back into Method 2: a leader's note is written
   * along its horizontal landing, in both systems. Method 1 governs the value on a DIMENSION line.
   */
  const leader = (d) => {
    const from = fx(d.at);
    const to = fx(d.to);
    const dir = Math.sign(to[0] - from[0]) || 1;
    const land = [to[0] + dir * DIM_STYLE.leaderLand, to[1]];
    const back = [from[0] - to[0], from[1] - to[1]];
    const m = Math.hypot(back[0], back[1]) || 1;
    seg(from, to);
    seg(to, land);
    arrowHead(from, [back[0] / m, back[1] / m]);
    value([land[0] + dir * 2, land[1] + DIM_STYLE.textLift], d.text, 'vp-dim vp-dim--note');
  };

  for (const d of data.dims[view] ?? []) {
    if (d.k === 'dim') linear(d);
    else leader(d);
  }

  let lines = null;
  let geometry = null;
  if (segments.length) {
    geometry = new LineSegmentsGeometry();
    geometry.setPositions(segments);
    lines = new LineSegments2(geometry, material);
    lines.computeLineDistances();
    lines.renderOrder = 2;   // after the solid and its ink edges, so it is the last thing drawn
    group.add(lines);
  }

  return {
    group,
    setResolution(w, h) { material.resolution.set(w, h); },
    dispose() {
      // The DOM nodes must leave with the geometry or they pile up (RULES.md §3.5).
      for (const { node, el } of labels) { el.remove(); node.removeFromParent(); }
      labels.length = 0;
      group.removeFromParent();
      geometry?.dispose();
      material.dispose();
      group.clear();
    },
  };
}
