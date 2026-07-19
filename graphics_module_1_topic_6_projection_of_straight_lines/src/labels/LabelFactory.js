// LabelFactory.js — creates CSS2DObjects. Nothing else.
//
// Single responsibility: turn a (type, text) into a live CSS2DObject DOM label with the correct class
// (from LabelStyles). It does NOT position the label, does NOT parent it, does NOT know the scene or
// the camera. Callers (LabelManager) own placement + parenting.

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { STYLE } from './LabelStyles.js';

/**
 * Create a CSS2DObject for a label type.
 * @param {string} type  a LabelType value
 * @param {string} text  the visible text
 * @returns {CSS2DObject} positioned at the origin (LabelManager writes the real position)
 */
export function createLabel(type, text) {
  const el = document.createElement('div');
  el.className = STYLE[type].className;   // styling comes from the ONE style table
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 0.5);               // anchor the pill on its point (the Points factory convention)
  obj.userData.labelType = type;          // provenance only (dup-audit / debugging) — never read for placement
  return obj;
}
