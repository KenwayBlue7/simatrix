// labels.js — CSS2D engineering-annotation factory (Phase 4G).
//
// A STATELESS label builder (the genericSolid.js-style shared §3.6 exception, like dimensions.js /
// sheet2DLayout.js): it holds no state and only creates a live CSS2DObject DOM node (vector-sharp,
// screen-reader-readable — RULES.md §3.27) that the caller adds to its group. Every consumer
// (lineRig.js 3D scene, compareSheet.js 2D sheet, traces.js / trueLength.js constructions,
// dimensions.js values) builds its text through here, so the annotation styling lives in one place.
//
// Colours + fonts are consumed as CSS custom properties via inline `var(--token)` (never a
// hard-coded value — ADR-003 / §4.1); the token resolves from :root at paint time. A paper
// text-shadow halo keeps a label legible over linework; `chip` boxes point/vertex letters; `break`
// gives a dimension value a paper background so the dimension line never crosses the digits (the
// Module 2 makeDimLabel convention). Disposal removes the DOM node in the caller's dispose traversal
// (§3.5) — CSS2DRenderer does not auto-remove a detached element.

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * @param {string} text
 * @param {object} [opts]
 *   color   CSS token name for the text colour (default --color-ink)
 *   mono    IBM Plex Mono + tabular-nums (numeric read-outs, §4.8) vs Atkinson sans
 *   size    font size (default 11px)
 *   weight  font weight 400|700 (Two-Weight Rule, §4.7 — default 700)
 *   chip    boxed white chip with a same-hue border (point/vertex letters)
 *   break   paper background + padding, no border (a dimension value's paper break)
 *   letter  letter-spacing (small caps view labels)
 * @returns {CSS2DObject}
 */
// The three standard plane/ink colour tokens map to the platform `.lbl--*` classes (index.html),
// so HP/VP callouts + the boxed A/B/a/b/a′/b′ chips read IDENTICALLY to the Points reference —
// same font (Atkinson 700), same token sizes (--text-sm / --text-xs), same chip box (currentColor
// border over an 88% paper wash). A non-standard colour (tl-green / construct / ink-secondary) or a
// numeric read-out falls back to an inline colour/mono on the same `.lbl` base, so it still inherits
// the engineering-tag family. This replaces the earlier ad-hoc inline styling (Issue 1: HP/VP read
// as bare floating text because they never used the `.lbl` classes).
const TOKEN_CLASS = { '--color-hp-line': 'lbl--hp', '--color-vp-line': 'lbl--vp', '--color-ink': 'lbl--ink' };

export function makeLabel(text, opts = {}) {
  const { color = '--color-ink', mono = false, chip = false, break: brk = false, letter = '', size, xy = false } = opts;
  const el = document.createElement('div');
  el.textContent = text;
  let cls = 'lbl';
  if (xy) cls += ' lbl--xy';               // x / y end marks: ink + --text-xs (platform class)
  if (chip) cls += ' lbl--chip';           // boxed engineering tag (currentColor border + paper wash)
  const tokCls = TOKEN_CLASS[color];
  if (tokCls && !xy) cls += ' ' + tokCls;  // hp/vp/ink colour from the platform classes
  el.className = cls;
  const s = el.style;
  if (!tokCls && !xy) s.color = `var(${color})`;   // non-standard colour → inline on the .lbl base
  if (mono) { s.fontFamily = 'var(--font-mono)'; s.fontVariantNumeric = 'tabular-nums'; s.fontWeight = '400'; }
  if (brk) { s.background = 'var(--color-paper)'; s.borderRadius = '2px'; s.padding = '0 3px'; } // dim-value paper break
  if (letter) s.letterSpacing = letter;
  if (size) s.fontSize = size;             // optional per-label size (lesson labels only; HP/VP omit it)
  return new CSS2DObject(el);
}

/** Build a label and add it to `parent` at `pos` ([x,y,z] or [x,y]). Returns the CSS2DObject. */
export function addLabel(parent, text, pos, opts) {
  const o = makeLabel(text, opts);
  o.position.set(pos[0], pos[1], pos[2] ?? 0);
  parent.add(o);
  return o;
}

/** Remove a CSS2DObject's DOM node from the document (call in a dispose traversal — §3.5). */
export function disposeLabels(root) {
  root.traverse((o) => { if (o.isCSS2DObject && o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element); });
}
