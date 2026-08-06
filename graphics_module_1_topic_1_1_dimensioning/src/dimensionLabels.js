// CSS2D label layer (Module 1 Topic 1.1 — Dimensioning).
//
// Everything on the drawing that is TEXT rather than linework lives here: the dimensional
// values, the Ø / R / Sø / SR / □ prefixed notes, the co-ordinate point numbers, and the
// clickable review hotspots of Step 6. `dimensionDraw.js` computes each anchor from the
// same geometry it strokes and hands the descriptors over through main.js, so the value
// can never drift off the line it belongs to.
//
// WHY CSS2D (RULES.md §3.27): a CSS2DObject is a real DOM node parked at a 3-D point —
// vector-sharp at any DPR, themed from the same tokens as the chrome, focusable and
// readable by assistive tech. That matters more here than anywhere else in the platform:
// the dimensional VALUE is the payload of the whole topic, and in Steps 2 and 6 it has to
// be draggable and clickable, which baked text could never be.
//
// TEXT ORIENTATION. CSS2DRenderer owns each object's OUTER element transform (it positions
// the node in screen space), so any rotation — BIS Method-1 turns the value to lie along
// its dimension line — must live on an INNER span. Method-2 leaves every value horizontal.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. Imports THREE + CSS2DObject only, and
// reports drags/clicks back through callbacks — it never converts screen pixels to world
// units itself, because the camera belongs to main.js.
//
// DISPOSAL (RULES.md §3.5): every CSS2DObject's DOM node is pulled out of the document in
// clear()/dispose(); they accumulate fast otherwise.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * @typedef {Object} LabelDescriptor
 * @property {string} id
 * @property {string} text
 * @property {THREE.Vector3} position
 * @property {number} [rotationDeg]  Method-1 turns the value along its dimension line.
 * @property {'ink'|'muted'|'bad'|'good'} [tone]
 * @property {boolean} [boxed]       Sits INSIDE an interrupted dimension line (Method-2).
 * @property {boolean} [draggable]   Step 2 — the learner may drag it out of position.
 * @property {0|1} [anchorX]         0 = text starts at the anchor, 1 = ends there.
 * @property {string} [title]        Tooltip / accessible description.
 */

/**
 * @typedef {Object} CalloutDescriptor
 * @property {string} text
 * @property {THREE.Vector3} position
 */

/**
 * Build the label layer.
 *
 * @param {THREE.Scene} scene Labels are added here; CSS2DRenderer walks the same graph.
 * @param {Object} [options]
 * @param {(id: string, dxPx: number, dyPx: number, phase: 'start'|'move'|'end') => void} [options.onDrag]
 * @param {(id: string) => void} [options.onPick]
 * @returns {{
 *   group: THREE.Group,
 *   setLabels: (list: LabelDescriptor[]) => void,
 *   setHotspots: (list: { id: string, label: string, position: THREE.Vector3, state?: string }[]) => void,
 *   setCallout: (descriptor: CalloutDescriptor|null) => void,
 *   setSheetCaption: (descriptor: (CalloutDescriptor & { sub?: string })|null) => void,
 *   setFocus: (ids: Set<string>|null) => void,
 *   setVisible: (on: boolean) => void,
 *   setResolution: (w: number, h: number) => void,
 *   clear: () => void,
 *   dispose: () => void,
 * }}
 */
export function createLabelLayer(scene, options = {}) {
  const { onDrag, onPick } = options;
  const resolution = new THREE.Vector2(options.width || 1, options.height || 1);

  const group = new THREE.Group();
  group.name = 'Dimension labels';
  scene.add(group);

  /** @type {{ obj: CSS2DObject, el: HTMLElement, id: string }[]} */
  let values = [];
  /** @type {{ obj: CSS2DObject, el: HTMLElement, id: string }[]} */
  let hotspots = [];
  /** The single viewport callout naming whatever the step is currently pointing at. */
  /** @type {{ obj: CSS2DObject, el: HTMLElement }|null} */
  let callout = null;
  /** The name of the drawing this layer belongs to, anchored BELOW it (compare mode). */
  /** @type {{ obj: CSS2DObject, el: HTMLElement }|null} */
  let caption = null;
  let focus = null;

  /** Remove one CSS2DObject's DOM node and detach it (RULES.md §3.5). */
  function removeObject(entry) {
    entry.el?.remove();
    entry.obj.element?.remove();
    group.remove(entry.obj);
  }

  /** Apply the current focus set: focused nodes stay full strength, the rest fade back.
   *  Opacity + weight, never a hue change — the Two-Cue Rule holds without new colour. */
  function applyFocus() {
    for (const { el, id } of [...values, ...hotspots]) {
      const off = focus && !focus.has(id);
      el.classList.toggle('is-faded', !!off);
    }
  }

  /** Wire the pointer drag that Step 2 uses to let a learner mis-place a value. */
  function wireDrag(el, id) {
    let active = false;
    let last = null;
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'grab';
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');

    el.addEventListener('pointerdown', (e) => {
      active = true;
      last = { x: e.clientX, y: e.clientY };
      // A synthetic pointer (tests, some assistive tooling) may have no capturable id;
      // capture is an enhancement, never a precondition for the drag.
      try { el.setPointerCapture?.(e.pointerId); } catch { /* no capturable pointer */ }
      el.style.cursor = 'grabbing';
      el.classList.add('is-dragging');
      onDrag?.(id, 0, 0, 'start');
      e.stopPropagation();
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      onDrag?.(id, e.clientX - last.x, e.clientY - last.y, 'move');
      last = { x: e.clientX, y: e.clientY };
      e.stopPropagation();
    });
    const end = (e) => {
      if (!active) return;
      active = false;
      el.style.cursor = 'grab';
      el.classList.remove('is-dragging');
      onDrag?.(id, 0, 0, 'end');
      e?.stopPropagation();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // Keyboard parity: arrow keys nudge the value, so the placement rules are reachable
    // without a pointer (PRODUCT.md accessibility commitment).
    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 12 : 4;
      const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      onDrag?.(id, 0, 0, 'start');
      onDrag?.(id, d[0], d[1], 'move');
      onDrag?.(id, 0, 0, 'end');
    });
  }

  return {
    group,

    /** Replace every dimensional value with a fresh set (called after each draw()). */
    setLabels(list) {
      for (const entry of values) removeObject(entry);
      values = [];
      for (const d of list) {
        const el = document.createElement('span');
        el.className = 'vp-value';
        if (d.tone && d.tone !== 'ink') el.classList.add(`is-${d.tone}`);
        if (d.boxed) el.classList.add('is-boxed');

        const inner = document.createElement('span');
        inner.className = 'vp-value__text';
        inner.textContent = d.text;
        inner.style.transform = `rotate(${-(d.rotationDeg || 0)}deg)`;
        el.appendChild(inner);
        if (d.title) el.title = d.title;

        const obj = new CSS2DObject(el);
        obj.position.copy(d.position);
        obj.center.set(d.anchorX === 0 ? 0 : d.anchorX === 1 ? 1 : 0.5, 0.5);
        group.add(obj);

        const entry = { obj, el, id: d.id };
        values.push(entry);
        if (d.draggable) wireDrag(el, d.id);
        else el.style.pointerEvents = 'none';
      }
      applyFocus();
    },

    /**
     * Replace the clickable review hotspots (Step 6). Real <button>s, so the mistake hunt
     * is keyboard-playable and screen-reader announced — never a bare raycast target.
     */
    setHotspots(list) {
      for (const entry of hotspots) removeObject(entry);
      hotspots = [];
      for (const h of list) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'vp-hotspot';
        if (h.state) el.classList.add(`is-${h.state}`);
        // The marker just judged is ringed, so the drawing and the explanation card point at
        // each other across twelve near-identical discs.
        if (h.current) el.classList.add('is-current');
        el.setAttribute('aria-label', h.label);
        el.title = h.label;
        // Glyph as well as colour, so the four states never rely on hue alone (Two-Cue Rule).
        el.textContent = h.state === 'found' ? '✓' : h.state === 'missed' ? '✗' : '?';
        el.style.pointerEvents = 'auto';
        el.addEventListener('click', (e) => { e.stopPropagation(); onPick?.(h.id); });
        el.addEventListener('pointerdown', (e) => e.stopPropagation());

        const obj = new CSS2DObject(el);
        obj.position.copy(h.position);
        obj.center.set(0.5, 0.5);
        group.add(obj);
        hotspots.push({ obj, el, id: h.id });
      }
      applyFocus();
    },

    /**
     * Name the thing the step is currently pointing at, ON the drawing (the `.vp-callout`
     * pill of the sibling Foundations topic). Pass null to take it off.
     *
     * It is deliberately NOT part of the focus set: a callout is chrome that names the
     * subject, never one of the strokes being compared, so it must not fade with them.
     *
     * @param {{ text: string, position: THREE.Vector3 }|null} descriptor
     */
    /**
     * Name the SHEET this layer belongs to, anchored in the sheet's own world space so it sits
     * directly under the drawing and moves with it. In a side-by-side compare the alternative
     * — one strip of names pinned to the top of the viewport — leaves the learner matching a
     * label at the top of the screen to a drawing in the middle of it.
     * @param {CalloutDescriptor|null} descriptor
     */
    setSheetCaption(descriptor) {
      if (caption) { removeObject(caption); caption = null; }
      if (!descriptor) return;
      const el = document.createElement('span');
      el.className = 'vp-sheet-name';
      // TWO LINES when the sheet is told apart by two things at once — Step 4 holds a method
      // AND a layout, and "Method 1 · Parallel" on one line reads as a single compound name
      // rather than as the two independent choices it is. Stacked, the learner can see at a
      // glance which of the two is the same on both sheets and which is not.
      if (descriptor.sub) {
        el.classList.add('vp-sheet-name--stacked');
        const main = document.createElement('span');
        main.className = 'vp-sheet-name__main';
        main.textContent = descriptor.text;
        const sub = document.createElement('span');
        sub.className = 'vp-sheet-name__sub';
        sub.textContent = descriptor.sub;
        el.append(main, sub);
      } else {
        el.textContent = descriptor.text;
      }
      el.style.pointerEvents = 'none';
      const obj = new CSS2DObject(el);
      obj.position.copy(descriptor.position);
      obj.center.set(0.5, 0.5);
      group.add(obj);
      caption = { obj, el };
    },

    setCallout(descriptor) {
      if (callout) { removeObject(callout); callout = null; }
      if (!descriptor) return;
      const el = document.createElement('span');
      el.className = 'vp-callout';
      el.textContent = descriptor.text;
      el.style.pointerEvents = 'none'; // never intercept drag-to-orbit
      const obj = new CSS2DObject(el);
      obj.position.copy(descriptor.position);
      obj.center.set(0.5, 0.5);
      group.add(obj);
      callout = { obj, el };
    },

    /** Focus a subset of ids (Step 1's element inspector); null clears the focus. */
    setFocus(ids) { focus = ids; applyFocus(); },

    setVisible(on) { group.visible = on; },

    setResolution(w, h) { resolution.set(w, h); },

    clear() {
      for (const entry of [...values, ...hotspots]) removeObject(entry);
      if (caption) { removeObject(caption); caption = null; }
      if (callout) removeObject(callout);
      values = [];
      hotspots = [];
      callout = null;
    },

    dispose() {
      this.clear();
      scene.remove(group);
    },
  };
}
