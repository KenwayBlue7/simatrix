// CSS2D label layer (Module 1 Topic 1) — the DOM-node overlay that names things in
// the viewport. Two jobs:
//   • LINE-TYPE CALLOUTS — a small pill for each BIS type ("Type A — visible",
//     "Type E/F — hidden", "Type G — centre line", "Type B — dimension"), revealed
//     in step with the layer it names, anchored at a representative point on the part.
//   • DIMENSION VALUES — the numeric size pills (90 / 46 / Ø30) for the Type B
//     dimensions. annotations.js authored the dimension LINES and computed the value
//     anchors; main.js hands that list here so the two layers stay consistent without
//     importing each other (ADR-007 star rule).
//
// WHY CSS2D (vertexLabeler lineage, CLAUDE.md / RULES.md §3.27). A CSS2DObject is a
// real DOM node positioned at a 3D point: zero asset cost, crisp at any DPR, themed
// from the same CSS tokens as the chrome, and readable by assistive tech — far better
// than baked SDF text, and reachable from the pinned import map (no new dependency).
//
// Layering (ADR-007 / RULES.md §3.6): imports THREE + CSS2DObject only. It does NOT
// import sibling layers or main.js. main.js owns the scene + the CSS2DRenderer and
// drives this via setCallout / addDimensionValues / showDimensionValues.
//
// DISPOSAL (RULES.md §3.5): every CSS2DObject's backing DOM node is removed inside
// clear()/dispose() — they accumulate fast otherwise.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** Small standoff so a callout anchored on the front face sits just proud of it,
 *  matching the annotation linework (annotations.js FACE_PROUD). */
const FACE_PROUD = 0.06;

/** Gap between a dimension line and its value-text pill (world units) — mirrors
 *  annotations.js DIM_TEXT_GAP. Applied here (not in annotations.js) because this is
 *  also the one place that knows which dimMode is active, and rotation + offset must
 *  agree on which side of the line is "above" for the current mode. */
const DIM_TEXT_GAP = 0.22;

/**
 * Build the CSS2D label layer. Mirrors the line drawer / annotation lifecycle so
 * main.js manages it identically.
 *
 * @param {THREE.Scene} scene  The label group is added here (CSS2DRenderer walks the
 *   same scene graph as the WebGL renderer).
 * @param {import('./bearingBlock.js').BEARING_BLOCK_DIMS} dims  Centred world dims.
 * @param {Object} [options]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {'aligned'|'uni'} [options.dimMode='aligned'] Dimensioning system for value text.
 * @returns {{
 *   group: THREE.Group,
 *   setCallout: (key: 'visible'|'hidden'|'centre'|'dimension', on: boolean) => void,
 *   addDimensionValues: (list: { text: string, anchor: THREE.Vector3, normalAligned: {x:number,y:number}, normalUni: {x:number,y:number}, isVertical?: boolean }[]) => void,
 *   showDimensionValues: (on: boolean) => void,
 *   setDimMode: (mode: 'aligned'|'uni') => void,
 *   setOpacity: (o: number) => void,
 *   setResolution: (w: number, h: number) => void,
 *   clear: () => void,
 *   dispose: () => void,
 * }}
 */
export function createLabelLayer(scene, dims, options = {}) {
  const resolution = new THREE.Vector2(options.width || 1, options.height || 1);

  // Dimensioning system for the value text: 'aligned' rotates values that sit on a vertical
  // dimension line so they read up the right edge (BIS default); 'uni' keeps everything
  // horizontal. main.js drives this via setDimMode when the Step-4 toggle changes.
  let dimMode = options.dimMode === 'uni' ? 'uni' : 'aligned';

  const group = new THREE.Group();
  group.name = 'Bearing Block Labels';
  scene.add(group);

  const zF = dims.halfDepth + FACE_PROUD; // front-face annotation plane

  // --- Line-type callouts. Anchored at a clear, representative point for each type;
  //     each starts hidden and is revealed by the step that introduces its layer. ---
  /** @type {Record<string, CSS2DObject>} */
  const callouts = {};

  /** Create one callout pill (a CSS2DObject) at a world anchor. */
  function makeCallout(key, text, anchor) {
    const el = document.createElement('span');
    el.className = 'vp-callout';
    el.textContent = text;
    el.style.pointerEvents = 'none'; // never intercept drag-to-orbit
    const obj = new CSS2DObject(el);
    obj.position.copy(anchor);
    obj.center.set(0.5, 0.5);
    obj.visible = false;
    callouts[key] = obj;
    group.add(obj);
  }

  makeCallout('visible', 'Type A — visible',
    new THREE.Vector3(0, dims.topY + 0.2, zF));
  // Anchored on the REAR bore rim (z = −halfDepth): in the front view that rim sits
  // behind the boss, so the callout points at a line the classifier genuinely marks
  // hidden/dashed — not the foot-hole top, which can read visible from many angles.
  makeCallout('hidden', 'Type E/F — hidden',
    new THREE.Vector3(0, dims.axisY + dims.boreRadius, -dims.halfDepth));
  makeCallout('centre', 'Type G — centre line',
    new THREE.Vector3(0, dims.axisY, dims.halfDepth + 0.55));
  makeCallout('dimension', 'Type B — dimension',
    new THREE.Vector3(dims.halfLength * 0.5, dims.baseBottomY - 1.25, zF));

  // --- Dimension value pills (added by main.js from annotations.getDimensionValueLabels).
  //     Each entry keeps its inner text span + anchor/normals + vertical flag so setDimMode
  //     can re-rotate AND reposition it in place, without rebuilding the DOM. ---
  /** @type {{ obj: CSS2DObject, inner: HTMLElement, isVertical: boolean, anchor: THREE.Vector3, normalAligned: {x:number,y:number}, normalUni: {x:number,y:number} }[]} */
  let dimValues = [];
  let dimValuesVisible = false;

  /** Apply the current dimMode to one pill: rotate its inner text span AND reposition the
   *  outer CSS2DObject off the dimension line, in one place — rotation and offset must
   *  agree on which side of the line reads as "above", so neither can be decided alone.
   *  Only values on a vertical dimension line rotate, and only in Aligned mode; everything
   *  else stays horizontal. The rotation lives on the INNER span because CSS2DRenderer
   *  owns the outer element's transform (it positions the pill). */
  function applyMode(entry) {
    const { obj, inner, isVertical, anchor, normalAligned, normalUni } = entry;
    const aligned = isVertical && dimMode === 'aligned';
    inner.style.transform = aligned ? 'rotate(-90deg)' : 'rotate(0deg)';
    const n = dimMode === 'aligned' ? normalAligned : normalUni;
    obj.position.set(
      anchor.x + n.x * DIM_TEXT_GAP,
      anchor.y + n.y * DIM_TEXT_GAP,
      anchor.z,
    );
  }

  /** Remove a CSS2DObject's DOM node and detach it from the group (RULES.md §3.5). */
  function removeObject(obj) {
    if (obj.element) obj.element.remove();
    group.remove(obj);
  }

  return {
    group,

    /** Reveal/hide one line-type callout (idempotent). */
    setCallout(key, on) {
      const obj = callouts[key];
      if (obj) obj.visible = on;
    },

    /**
     * Replace the dimension value pills with a fresh set. main.js calls this once per
     * rebuild with annotations.getDimensionValueLabels(); the new pills inherit the
     * current shown/hidden state so a rebuild mid-lesson doesn't flash them on, and the
     * current dimMode so an in-flight Aligned/Unidirectional choice survives the rebuild.
     * @param {{ text: string, anchor: THREE.Vector3, normalAligned: {x:number,y:number}, normalUni: {x:number,y:number}, isVertical?: boolean }[]} list
     */
    addDimensionValues(list) {
      for (const { obj } of dimValues) removeObject(obj);
      dimValues = [];
      for (const { text, anchor, normalAligned, normalUni, isVertical } of list) {
        const el = document.createElement('span');
        el.className = 'vp-dim-value';
        el.style.pointerEvents = 'none';
        // Text lives in an INNER span so it can be rotated independently of the outer
        // element's CSS2DRenderer-owned positioning transform (see applyMode).
        const inner = document.createElement('span');
        inner.className = 'vp-dim-value__text';
        inner.textContent = text;
        el.appendChild(inner);
        const obj = new CSS2DObject(el);
        obj.center.set(0.5, 0.5);
        obj.visible = dimValuesVisible;
        const entry = { obj, inner, isVertical: !!isVertical, anchor, normalAligned, normalUni };
        applyMode(entry);
        dimValues.push(entry);
        group.add(obj);
      }
    },

    /** Reveal/hide all dimension value pills together (Step 4). */
    showDimensionValues(on) {
      dimValuesVisible = on;
      for (const { obj } of dimValues) obj.visible = on;
    },

    /** Switch the dimensioning system (Aligned ↔ Unidirectional) and re-rotate + reposition
     *  the value text in place — no DOM rebuild. */
    setDimMode(mode) {
      dimMode = mode === 'uni' ? 'uni' : 'aligned';
      for (const entry of dimValues) applyMode(entry);
    },

    /** Fade every pill (DOM opacity). Kept for lifecycle parity with the line layers. */
    setOpacity(o) {
      for (const obj of group.children) {
        if (obj.element) obj.element.style.opacity = String(o);
      }
    },

    /** No fat lines here, but main.js drives resolution uniformly across layers on
     *  resize; store it so the contract holds and any future fat line is covered. */
    setResolution(w, h) {
      resolution.set(w, h);
    },

    /** Remove every CSS2DObject's DOM node and detach it (disposal contract). */
    clear() {
      for (let i = group.children.length - 1; i >= 0; i--) {
        removeObject(group.children[i]);
      }
      dimValues = [];
    },

    dispose() {
      this.clear();
      scene.remove(group);
    },
  };
}
