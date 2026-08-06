// Step-Compare annotation layer for the 3D prism (2026-08-06) — adapted from
// Module2/src/vertexLabeler.js, NOT byte-identical-shared (RULES §7.2's guarantee is scoped
// to the Module-2 family; this track's own precedent is cube.js/developmentEngine.js, both
// independent copies free to drift, ADR-112). Only the label-placement + CSS2D disposal
// machinery is kept — Module2's chain-line axis and dashed-generator LineSegments2 rig has
// no analogue here (this topic draws no 3D axis) and is deliberately dropped.
//
// WHY the numbering isn't inferred from geometry (Module2's uniqueLocalVertices/orderRing
// atan2 sort): a BoxGeometry's 8 corners and their correspondence to constructions.js's
// station numerals ('1','2','3','4', unprimed on both rings — see constructions.js:314-331,
// DESIGN.md §6) is exact, not something a winding-order guess should re-derive. cube.js
// centres a THREE.BoxGeometry(baseLength, height, baseWidth) on the origin (X=length,
// Y=height/up, Z=depth), camera at (120,90,120) so +Z faces the viewer. constructions.js's
// toTop(x,y) puts y=0 at the fold line (first-angle: nearest the VP, i.e. the REAR face) and
// y=Wd nearest the observer (the FRONT face). So:
//   1 = toTop(0,  0)  -> rear-left   (-Lf/2, -Wd/2)
//   2 = toTop(Lf, 0)  -> rear-right  (+Lf/2, -Wd/2)
//   3 = toTop(Lf, Wd) -> front-right (+Lf/2, +Wd/2)
//   4 = toTop(0,  Wd) -> front-left  (-Lf/2, +Wd/2)
// Each numeral appears on BOTH the base ring (y=-H/2) and the top ring (y=+H/2), unprimed —
// matching the development pattern's own devNumeralsTop/devNumeralsBottom, which reuse the
// same four digits on both rows (constructions.js:320-323). Do not add primes; that glyph
// exists nowhere on this topic's 2D plate.
//
// WHY CSS2DRenderer and not 3D text/sprites: same reasoning as vertexLabeler.js's own header
// — a real DOM node positioned at a 3D point, zero asset cost, crisp at any DPR, themeable
// from the same CSS tokens as the rest of the chrome (RULES §3.27 CSS2D-label convention).
//
// Layering (CLAUDE.md): leaf module. Imports THREE + the CSS2DObject addon only; does not
// import main.js or a sibling leaf. view3d.js owns the scene + CSS2DRenderer instance and
// calls generate()/clear()/dispose() from its own lifecycle (show3D/rebuild3D/clear3D).

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** Vertex labels CASCADE in on generate(): each starts transparent and eases to full
 *  opacity, staggered by index — same flourish as Module2's vertexLabeler.js, same tuning. */
const LABEL_FADE_MS = 240;
const LABEL_STAGGER_MS = 35;

/**
 * The four top-view station numerals in constructions.js's own winding order (1,2,3,4 —
 * rear-left, rear-right, front-right, front-left), as unit-box (sx, sz) signs. Multiplied by
 * (Lf/2, Wd/2) at generate()-time against the mesh's own bounding box, so this table needs no
 * `params` and cannot drift from buildPrism()'s '?? 30 / ?? 24 / ?? 40' defaults.
 */
const STATIONS = [
  { text: '1', sx: -1, sz: -1 },
  { text: '2', sx: +1, sz: -1 },
  { text: '3', sx: +1, sz: +1 },
  { text: '4', sx: -1, sz: +1 },
];

/**
 * Plan the 8 prism corner labels (4 stations × base/top ring) in LOCAL space, straight from
 * the mesh's own bounding box — exact, no vertex dedup/atan2 inference needed for a box.
 * @param {THREE.Mesh} mesh
 * @returns {{ local: THREE.Vector3, text: string }[]}
 */
function planPrismStations(mesh) {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return [];
  const hx = (box.max.x - box.min.x) / 2;
  const hy = (box.max.y - box.min.y) / 2;
  const hz = (box.max.z - box.min.z) / 2;
  const cx = (box.max.x + box.min.x) / 2;
  const cy = (box.max.y + box.min.y) / 2;
  const cz = (box.max.z + box.min.z) / 2;

  const labels = [];
  for (const ring of [-1, +1]) { // base (y=-H/2), top (y=+H/2) — unprimed on both, see header
    for (const s of STATIONS) {
      labels.push({
        local: new THREE.Vector3(cx + s.sx * hx, cy + ring * hy, cz + s.sz * hz),
        text: s.text,
      });
    }
  }
  return labels;
}

/**
 * Wire a Compare-pane annotation controller onto a scene. Owns one persistent group (added
 * to the scene once) and rebuilds its CSS2DObject labels on each generate() call. Mirrors
 * view3d.js's own {generate, clear, dispose} shape so main.js/view3d.js can treat it like any
 * other lifecycle-managed layer.
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, generate: (mesh: THREE.Mesh) => void, clear: () => void, dispose: () => void }}
 */
export function initLabels3d(scene) {
  const group = new THREE.Group();
  group.name = 'Prism Corner Labels';
  scene.add(group);

  /** Detach + dispose every child's DOM node (CSS2DObject leaves nothing else to free). */
  function clear() {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const obj = group.children[i];
      if (obj.element) obj.element.remove();
      group.remove(obj);
    }
  }

  /**
   * Place the 8 station labels for the given prism mesh. The mesh's matrixWorld must be
   * current (view3d.js calls mesh.updateWorldMatrix before this). Positions are world-space;
   * CSS2DRenderer reprojects every frame, so labels track the camera with no per-frame work
   * here.
   */
  function generate(mesh) {
    clear();
    if (!mesh) return;
    const labels = planPrismStations(mesh);
    if (labels.length === 0) return;

    const matrixWorld = mesh.matrixWorld;
    const worldOf = (local) => local.clone().applyMatrix4(matrixWorld);

    // Nudge each label OUTWARD off the solid's own edges — a label centred exactly on a
    // vertex overlaps the three edges meeting there. Offset scales with the solid's size
    // (same formula as vertexLabeler.js).
    const worlds = labels.map(({ local }) => worldOf(local));
    const centroid = worlds
      .reduce((sum, v) => sum.add(v), new THREE.Vector3())
      .multiplyScalar(1 / worlds.length);
    let radius = 0;
    for (const w of worlds) radius = Math.max(radius, w.distanceTo(centroid));
    const offset = Math.max(0.06, radius * 0.12);

    const reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    labels.forEach(({ text }, i) => {
      const pos = worlds[i].clone();
      const dir = pos.clone().sub(centroid);
      if (dir.lengthSq() > 1e-6) pos.add(dir.normalize().multiplyScalar(offset));

      const el = document.createElement('span');
      el.className = 'vlabel';
      el.textContent = text;
      el.style.pointerEvents = 'none'; // drag-to-orbit must pass straight through

      if (!reduceMotion) {
        el.style.opacity = '0';
        el.style.transition = `opacity ${LABEL_FADE_MS}ms var(--ease-standard)`;
        el.style.transitionDelay = `${i * LABEL_STAGGER_MS}ms`;
      }

      const obj = new CSS2DObject(el);
      obj.position.copy(pos);
      obj.center.set(0.5, 0.5);
      group.add(obj);
    });

    // Flip freshly-added labels opaque next frame so the transition actually animates
    // (setting opacity in the same frame they're created would paint them straight to full).
    if (!reduceMotion) {
      requestAnimationFrame(() => {
        for (const child of group.children) {
          if (child.element?.classList.contains('vlabel')) child.element.style.opacity = '1';
        }
      });
    }
  }

  function dispose() {
    clear();
    scene.remove(group);
  }

  return { group, generate, clear, dispose };
}
