// labelLayer.js — CSS2D callouts (leaf module, ADR-007 star topology): HP/VP/PP plane
// tags, the four quadrant numerals (I–IV, the active one highlighted per Two-Cue —
// pattern ported from spatial_framework/src/labelLayer.js's QUAD_ANCHORS), and the
// "F" chip beside the pictorial front-view arrow (solidViews.js's fArrow).
//
// WHY CSS2D (RULES.md §3.27): a CSS2DObject is a real DOM node positioned at a 3D
// point — zero asset cost, crisp at any DPR, themed from the same CSS tokens as the
// chrome, and readable by assistive tech.
//
// The HP tag rides HP's fold (added to the caller-supplied hpGroup); the PP tag rides
// PP's fold (added to ppGroup); VP's tag, the quadrant numerals, and the F chip are
// stationary (added to this layer's own top-level group) — matching spatial_framework's
// own choice to keep quadrant numerals off the fold hinge.
//
// DISPOSAL (RULES.md §3.5): dispose() physically removes every CSS2DObject's backing
// DOM node from the document before dropping the objects.
//
// Layering (RULES.md §3.6): leaf module — imports three + CSS2DObject only, never a
// sibling leaf.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** The four quadrant numerals, positioned near the HP∩VP corner (world-stationary —
 *  they describe the 3D corner itself, not fold-riding plane content). Offset along X
 *  (clear of the object, which always sits at x=0) purely for legibility. */
const QUAD_ANCHORS = [
  { text: 'I', quadrant: 'Q1', at: { x: 2.6, y: 1.8, z: 1.8 } },
  { text: 'II', quadrant: 'Q2', at: { x: 2.6, y: 1.8, z: -1.8 } },
  { text: 'III', quadrant: 'Q3', at: { x: 2.6, y: -1.8, z: -1.8 } },
  { text: 'IV', quadrant: 'Q4', at: { x: 2.6, y: -1.8, z: 1.8 } },
];

/**
 * @param {Object} opts
 * @param {THREE.Object3D} opts.hpGroup  HP's fold pivot — the HP tag is parented here.
 * @param {THREE.Object3D} opts.ppGroup  PP's fold pivot — the PP tag is parented here.
 * @param {{x:number,y:number,z:number}} opts.hpAnchorLocal  Tag position in HP's local frame.
 * @param {{x:number,y:number,z:number}} opts.ppAnchorLocal  Tag position in PP's local frame.
 * @param {{x:number,y:number,z:number}} opts.vpAnchorWorld  Tag position in world space (VP is stationary).
 * @param {string|null} [opts.quadrant]  'Q1'|'Q3' — the object's current quadrant, highlighted; null hides all four numerals.
 * @param {{x:number,y:number,z:number}|null} [opts.fAnchorWorld]  Position for the "F" chip; null hides it.
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createLabelLayer({ hpGroup, ppGroup, hpAnchorLocal, ppAnchorLocal, vpAnchorWorld, quadrant = null, fAnchorWorld = null }) {
  const group = new THREE.Group();
  group.name = 'Plane Labels';

  function makeLabel(parent, text, className, pos) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.set(pos.x, pos.y, pos.z);
    obj.center.set(0.5, 0.5);
    parent.add(obj);
    return obj;
  }

  const hpLabel = makeLabel(hpGroup, 'HP', 'lbl lbl--hp', hpAnchorLocal);
  const ppLabel = makeLabel(ppGroup, 'PP', 'lbl lbl--pp', ppAnchorLocal);
  const vpLabel = makeLabel(group, 'VP', 'lbl lbl--vp', vpAnchorWorld);

  const quadLabels = quadrant
    ? QUAD_ANCHORS.map(({ text, quadrant: q, at }) =>
        makeLabel(group, text, q === quadrant ? 'lbl lbl--quad is-active' : 'lbl lbl--quad', at))
    : [];

  const fLabel = fAnchorWorld ? makeLabel(group, 'F', 'lbl lbl--f', fAnchorWorld) : null;

  return {
    group,
    /** Remove every CSS2DObject AND its backing DOM node (RULES.md §3.5). */
    dispose() {
      for (const obj of [hpLabel, ppLabel, vpLabel, fLabel, ...quadLabels]) {
        if (!obj) continue;
        obj.element?.remove();
        obj.removeFromParent();
      }
      group.clear();
    },
  };
}
