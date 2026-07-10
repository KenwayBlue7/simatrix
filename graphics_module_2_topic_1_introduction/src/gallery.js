// Gallery UI controller — the bridge between the HTML chrome and the sim. Builds the
// categorised shape sidebar from the roster, renders the anatomy panel for the
// selected solid, and wires the annotation-layer + spin toggles and Reset.
//
// Layering (CLAUDE.md): leaf layer, modelled on Topic 2's uiManager.js. It imports
// only the content layer (anatomy.js) and depends on main.js solely through the
// injected `sim` controller — it never reaches into the scene, THREE, or the data/
// geometry layers. Returns { sync, dispose } so main.js can re-sync after a platform
// reset and tear listeners down. Pure DOM.

import { ROSTER, CONCEPTS, factsFor } from './anatomy.js';

/**
 * @typedef {Object} SimController  Injected by main.js. gallery.js depends only on this.
 * @property {() => (import('./shapeData.js').ShapeData | null)} state  Current shape data, or null.
 * @property {() => {axis:boolean, labels:boolean, generators:boolean}} layers  Layer flags (copy).
 * @property {() => boolean} spinning                       Whether the turntable is on.
 * @property {(shape:string) => void} selectShape           Rebuild to a shape + announce.
 * @property {(layer:string, on:boolean) => void} setLayer  Show/hide an annotation layer.
 * @property {(on:boolean) => void} setSpin                 Turn the turntable on/off.
 * @property {() => void} reset                             Route through simAPI.reset().
 */

/**
 * Wire the gallery chrome to the sim controller.
 * @param {SimController} sim
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initGallery(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const rail = $('shape-rail');
  const content = $('anatomy-content');
  const tglAxis = $('tgl-axis');
  const tglLabels = $('tgl-labels');
  const tglGenerators = $('tgl-generators');
  const tglSpin = $('tgl-spin');
  const btnReset = $('btn-reset');

  // --- Build the sidebar ONCE from the roster (it never changes). Content is from our
  //     own static data module, so template-string innerHTML is safe (no user input). ---
  if (rail) {
    let html = '';
    for (const cat of ROSTER) {
      html += `<section class="rail-cat">`;
      html += `<h2 class="rail-cat__title">${cat.category}</h2>`;
      html += `<p class="rail-cat__blurb">${cat.blurb}</p>`;
      for (const group of cat.groups) {
        if (group.subLabel) html += `<h3 class="rail-sub">${group.subLabel}</h3>`;
        html += `<ul class="rail-list">`;
        for (const item of group.items) {
          html += `<li><button type="button" class="shape-btn" data-shape="${item.shape}">${item.label}</button></li>`;
        }
        html += `</ul>`;
      }
      html += `</section>`;
    }
    rail.innerHTML = html;
  }

  // Delegated selection — one listener for every shape button.
  rail?.addEventListener('click', (e) => {
    const btn = e.target.closest('.shape-btn');
    if (!btn) return;
    sim.selectShape(btn.dataset.shape);
    sync();
  }, listen);

  // --- Annotation-layer + spin toggles (static markup, wired once) + Reset. ---
  tglAxis?.addEventListener('change', () => sim.setLayer('axis', tglAxis.checked), listen);
  tglLabels?.addEventListener('change', () => sim.setLayer('labels', tglLabels.checked), listen);
  tglGenerators?.addEventListener('change', () => sim.setLayer('generators', tglGenerators.checked), listen);
  tglSpin?.addEventListener('change', () => sim.setSpin(tglSpin.checked), listen);
  btnReset?.addEventListener('click', () => sim.reset(), listen);

  /** Re-render the per-shape anatomy content (title, definition, fact grid, key parts). */
  function renderContent() {
    if (!content) return;
    const s = sim.state();
    if (!s) { content.innerHTML = ''; return; }
    const f = factsFor(s.shape);

    const rows = [
      ['Base', f.base],
      ['Faces', f.faces],
      ['Edges', f.edges],
      ['Vertices', f.vertices],
    ];

    let html = '';
    html += `<h1 class="panel__title">${f.name}</h1>`;
    html += `<p class="panel__lead">${f.definition}</p>`;

    html += `<dl class="facts">`;
    for (const [k, v] of rows) {
      html += `<div class="facts__row"><dt class="facts__key">${k}</dt><dd class="facts__val">${v}</dd></div>`;
    }
    html += `</dl>`;

    html += `<h2 class="panel__sub">Key parts</h2>`;
    html += `<ul class="concepts">`;
    for (const c of CONCEPTS) {
      const present = c.appliesTo(f);
      // Two-Cue Rule: absent parts are dimmed AND labelled "not on this solid" — never
      // colour alone (DESIGN.md).
      html += `<li class="concept${present ? '' : ' is-absent'}">`;
      html += `<span class="concept__name">${c.name}`;
      if (!present) html += ` <span class="concept__na">· not on this solid</span>`;
      html += `</span>`;
      html += `<span class="concept__blurb">${c.blurb}</span>`;
      html += `</li>`;
    }
    html += `</ul>`;

    content.innerHTML = html;
  }

  /** Full refresh from current state — initial load, shape change, and reset. */
  function sync() {
    const s = sim.state();

    // Active shape button (shape cue + aria-current, not colour alone).
    if (rail) {
      for (const btn of rail.querySelectorAll('.shape-btn')) {
        const on = !!s && btn.dataset.shape === s.shape;
        btn.classList.toggle('is-active', on);
        if (on) btn.setAttribute('aria-current', 'true');
        else btn.removeAttribute('aria-current');
      }
    }

    // Layer + spin toggles.
    const layers = sim.layers();
    if (tglAxis) tglAxis.checked = layers.axis;
    if (tglLabels) tglLabels.checked = layers.labels;
    if (tglGenerators) {
      // Generators only exist on curved solids — lock the toggle otherwise (DESIGN.md
      // disabled-by-hierarchy: reduced opacity + padlock, reads as "not applicable here").
      const hasGen = !!s && factsFor(s.shape).hasGenerators;
      tglGenerators.disabled = !hasGen;
      tglGenerators.checked = hasGen && layers.generators;
    }
    if (tglSpin) tglSpin.checked = sim.spinning();

    renderContent();
  }

  sync();

  return { sync, dispose: () => ac.abort() };
}
