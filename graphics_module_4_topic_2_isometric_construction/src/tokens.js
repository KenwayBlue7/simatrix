// Design-token access — Module 4, Topic 2: How to Construct an Isometric Drawing.
//
// Every colour in this topic is read from a CSS custom property at runtime (RULES.md §4.1/§4.2,
// ADR-003): the `:root` block in index.html is the single source of truth, and no JS file anywhere
// in this topic contains a colour literal.
//
// Layering (CLAUDE.md / RULES.md §3.6a): this is a STATELESS SHARED UTILITY — it holds no state,
// owns no DOM, and couples to no sibling behaviour leaf. Several leaves (shapeFactory,
// constructionEngine, orthographicDrawer, labelLayer) may therefore import it, exactly as
// `genericSolid.js` / `labelPlacement.js` are shared elsewhere on the platform. It must stay that
// way: the moment it grows state or reaches into another leaf's scene, it becomes the coupling
// §3.6 forbids.

import * as THREE from 'three';

/** Read once per call — `getComputedStyle` on the root is cheap and always current (a token could
 *  in principle be re-themed at runtime; nothing here caches a stale hex). */
function rootStyle() {
  return getComputedStyle(document.documentElement);
}

/**
 * Raw value of a CSS custom property.
 * @param {string} name  e.g. `--color-ink`
 * @returns {string}
 */
export function cssVar(name) {
  return rootStyle().getPropertyValue(name).trim();
}

/**
 * A design token as a `THREE.Color`.
 * @param {string} name  e.g. `--color-ink`
 * @returns {THREE.Color}
 */
export function cssColor(name) {
  return new THREE.Color(cssVar(name));
}

/**
 * The line weights this topic draws with, named by ROLE rather than by number so a call site reads
 * as intent. Engineering linework is fat-line only (RULES.md §3.12/§3.13) — `LineBasicMaterial`
 * caps at 1px on most GPUs, which would make the whole construction hierarchy collapse to one
 * weight. The hierarchy itself is the teaching device: a construction line must read as *lighter*
 * than the finished edge it helps produce, which is the Two-Cue partner (weight) to the
 * grey/ink colour difference.
 */
export const WEIGHT = {
  /** Finished visible edges of the completed drawing. */
  finished: 2.4,
  /** The three isometric axes — the heaviest guide, because everything springs from them. */
  axis: 3.0,
  /** Bounding-box / construction linework, deliberately thinner than a finished edge. */
  construction: 1.6,
  /** Dimension-transfer arrows flying across from the orthographic views. */
  transfer: 1.4,
  /** Extension + dimension lines. The THINNEST thing in the scene on purpose: a dimension annotates
   *  the drawing, it is not part of it, and the object has to stay the visual focus. */
  dimension: 1.1,
};

/** The one place a token NAME is bound to a construction ROLE. Everything downstream asks for a
 *  role, so re-theming a role is a one-line change here rather than a sweep. */
export const ROLE_COLOR = {
  finished: '--color-ink',
  axis: '--color-ink',
  construction: '--color-bench-grey',
  transfer: '--color-bench-grey',
  /** Dimensioning. Bench grey, NOT the `--color-ink` the Module-2 orthographic sheet dimensions in
   *  (ADR-041): there the dimensions ARE the subject, here they annotate a pictorial the object has
   *  to stay the focus of. Same standard, lighter register (ADR-049). */
  dimension: '--color-bench-grey',
  solid: '--color-solid-fill',
  /** The orthographic reference planes keep the platform's domain encodings (DESIGN.md §2.1):
   *  HP teal for the top view, VP amber for the front view, PP violet for the side view. */
  hp: '--color-hp-line',
  vp: '--color-vp-line',
  pp: '--color-pp-line',
};

/**
 * Colour for a construction role.
 * @param {keyof typeof ROLE_COLOR} role
 * @returns {THREE.Color}
 */
export function roleColor(role) {
  return cssColor(ROLE_COLOR[role] ?? ROLE_COLOR.finished);
}
