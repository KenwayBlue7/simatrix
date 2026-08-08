// Label layer — every viewport annotation in this topic, and the ONE placement policy behind them.
//
// Labels are live `CSS2DObject` DOM nodes, never baked sprites (RULES.md §3.27): they stay
// vector-sharp at any zoom, inherit the design tokens, and are readable by a screen reader. Two
// consequences that bite if forgotten, both handled here:
//
//   • `CSS2DRenderer` honours each object's OWN `.visible`, NOT an ancestor group's. Hiding a group
//     leaves every nested label's `<div>` sitting on screen (§3.27). So `set()` always drives the
//     label object itself.
//   • The `<div>`s are real DOM and accumulate. `clearAll()` pulls them out of the document as part
//     of the rebuild disposal contract (§3.5), which is why labels are created per-rebuild here
//     rather than once at boot.
//
// THE PLACEMENT POLICY (RULES.md §3.27a). Every standoff in this topic is sourced from the single
// `PLACEMENT` table below — no leaf invents an inline offset. The governing strategy is DESIGN.md
// §5.9, "nudge the label outward off the linework", applied per geometry:
//
//   outboard   a dimension written against an edge        → pushed OFF that edge, along a supplied
//                                                           outward direction, so it never sits on
//                                                           the linework it measures
//   crown      a title naming the whole solid             → straight UP, clear of the highest edge
//
// Layering (CLAUDE.md): leaf module. Imports THREE only; main.js owns the scene and hands it in.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * The one offset table. Values are in WORLD units and are deliberately small — a label should sit
 * just clear of the linework it names, not float away from it.
 */
export const PLACEMENT = {
  /** How far a dimension label is pushed off the edge it measures, along the supplied direction. */
  outboard: 0.34,
  /** Lift above the top of the solid for a title. */
  crown: 0.55,
  /**
   * Clear air between the highest thing the solid projects and a FIGURE TITLE — in NDC, which is
   * to say as a fraction of the viewport half-height.
   *
   * SCREEN space, not world space, and that is the whole point. A title is the caption of a figure,
   * so the gap that reads as "right" is a gap on the page: the same handful of pixels whether the
   * figure is a 20 mm cube or a 110 mm slab. A world-space clearance cannot do that — the camera
   * pulls back for a bigger solid, so the same world gap shrinks on screen exactly when the drawing
   * grows.
   */
  figureClearScreen: 0.115,
};

/**
 * How long `.vp-label`'s fade runs before `visible` may be dropped. Must stay in step with the CSS
 * `--dur-base` transition on `.vp-label`; a shorter value snaps the label away mid-fade.
 */
const FADE_MS = 220;

/**
 * @param {THREE.Scene} scene
 * @param {{ prefersReducedMotion: boolean }} opts
 */
export function initLabelLayer(scene, { prefersReducedMotion }) {
  /** @type {Map<string, CSS2DObject>} */
  const labels = new Map();
  /** @type {Map<string, number>} */
  const timers = new Map();

  /**
   * Create (or replace) a label.
   * @param {string} key        Stable handle used by `set` / `setText`.
   * @param {string} text
   * @param {string} className  A `.vp-label--*` modifier.
   * @param {THREE.Vector3} anchor  World position, already offset by `place()`.
   */
  function make(key, text, className, anchor) {
    remove(key);
    const el = document.createElement('div');
    el.className = `vp-label ${className}`;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.copy(anchor);
    obj.center.set(0.5, 0.5);
    obj.visible = false;
    scene.add(obj);
    labels.set(key, obj);
    return obj;
  }

  /**
   * Apply the placement policy for a role.
   * @param {'outboard'|'crown'} role
   * @param {THREE.Vector3} base   The point being annotated.
   * @param {THREE.Vector3} [dir]  Required for `outboard`: the direction to push the label along.
   */
  function place(role, base, dir) {
    const p = base.clone();
    if (role === 'outboard' && dir) return p.addScaledVector(dir.clone().normalize(), PLACEMENT.outboard);
    if (role === 'crown') return p.add(new THREE.Vector3(0, PLACEMENT.crown, 0));
    return p;
  }

  /**
   * Anchor for a FIGURE TITLE — horizontally centred, and lifted clear of the whole drawing rather
   * than of the point directly beneath it.
   *
   * The subtlety this exists for: the highest thing a solid projects is rarely the point directly
   * above its centre. A box throws a top CORNER highest, a cylinder the far side of its top circle,
   * a sphere its pole — and how much higher depends on the camera and on perspective. A fixed lift
   * therefore either lands on the geometry or floats absurdly, depending on the shape. So the
   * caller PROJECTS the real candidates against the live camera, converts the result back into a
   * world lift, and passes it in; this table owns only the clearance added on top.
   *
   * @param {number} topY  World height of the top of the solid.
   * @param {number} rise  World lift that clears the highest projected point, plus the clearance.
   */
  function placeFigureTitle(topY, rise = 0) {
    return new THREE.Vector3(0, topY + Math.max(rise, 0), 0);
  }

  /** Move an existing label. Used for the live figure titles, which re-derive their lift each frame. */
  function moveTo(key, position) {
    const obj = labels.get(key);
    if (obj) obj.position.copy(position);
  }

  /**
   * Show or hide a label. With `animate` it fades and lifts (the `.is-in` CSS class); `visible` is
   * only dropped once the fade-out has finished, so a label can be toggled repeatedly without ever
   * snapping — the behaviour Topic 1's repeatable Step-1 toggle established.
   */
  function set(key, on, { animate = false } = {}) {
    const obj = labels.get(key);
    if (!obj) return;
    const el = obj.element;
    const t = timers.get(key);
    if (t) { clearTimeout(t); timers.delete(key); }

    if (on) {
      if (obj.visible && el.classList.contains('is-in')) return; // already shown — never re-flash
      obj.visible = true;
      if (animate && !prefersReducedMotion) {
        el.classList.remove('is-in');
        // Two frames, so the browser has a start value to transition from.
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
      } else {
        el.classList.add('is-in');
      }
      return;
    }

    el.classList.remove('is-in');
    if (animate && !prefersReducedMotion) {
      timers.set(key, setTimeout(() => { obj.visible = false; timers.delete(key); }, FADE_MS));
    } else {
      obj.visible = false;
    }
  }

  function setText(key, text) {
    const obj = labels.get(key);
    if (obj) obj.element.textContent = text;
  }

  function has(key) { return labels.has(key); }

  /** Pull one label out of the scene AND out of the DOM. */
  function remove(key) {
    const obj = labels.get(key);
    if (!obj) return;
    const t = timers.get(key);
    if (t) { clearTimeout(t); timers.delete(key); }
    obj.element.remove();   // §3.5 — the DOM node is the thing that leaks
    obj.removeFromParent();
    labels.delete(key);
  }

  /** Hide every label without destroying it (a step change, not a rebuild). */
  function hideAll({ animate = false } = {}) {
    for (const key of labels.keys()) set(key, false, { animate });
  }

  /** Full teardown — part of the rebuild disposal contract. */
  function clearAll() {
    for (const key of [...labels.keys()]) remove(key);
  }

  return {
    make, place, placeFigureTitle, moveTo, set, setText, has, remove, hideAll, clearAll,
    keys: () => [...labels.keys()],
  };
}
