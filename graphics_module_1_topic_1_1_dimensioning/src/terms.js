// Glossary popover (Module 1 Topic 1.1 — Dimensioning). Surfaces the inline
// <button class="term" data-t="…"> triggers that dimensionUI.js injects into the step card,
// showing each term's definition in a single shared, viewport-fixed #term-pop.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. It imports NOTHING — main.js passes the
// TERMS map in. It owns only the popover DOM behaviour, nothing in the 3D scene.
//
// CRITICAL — EVENT DELEGATION, not a one-shot bind. The .term buttons are (re)created every
// time dimensionUI.js paints a step, so querying `.term` once on boot (as Module 2's terms.js
// does, since its terms are static in index.html) would bind stale/absent nodes. Instead we
// delegate hover/focus/click from a STABLE ancestor (#wizard) and resolve the term with
// `.closest('.term')` at event time, so freshly-injected buttons always work.

const MARGIN = 8; // keep the popover this far inside the viewport edges

/**
 * Wire the glossary popover.
 * @param {Object}  opts
 * @param {Record<string, { label: string, def: string }>} opts.terms  Glossary map (data-t → entry).
 * @param {string|Element} [opts.root='#wizard']  Stable delegation ancestor of the term buttons.
 * @param {string} [opts.popId='term-pop']         Id of the shared popover element.
 * @returns {() => void} disposer
 */
export function initTerms({ terms, root = '#wizard', popId = 'term-pop' } = {}) {
  const rootEl = typeof root === 'string' ? document.querySelector(root) : root;
  const pop = document.getElementById(popId);
  if (!rootEl || !pop || !terms) return () => {};

  const ac = new AbortController();
  const listen = { signal: ac.signal };
  let open = null; // the .term whose definition is currently shown

  /** Place the fixed popover under (or, if it would overflow, above) the term. */
  function place(term) {
    const t = term.getBoundingClientRect();
    const p = pop.getBoundingClientRect();

    let top = t.bottom + 6;
    let above = false;
    if (top + p.height > window.innerHeight - MARGIN) {
      top = t.top - p.height - 6; // not enough room below → flip above the word
      above = true;
    }
    let left = t.left;
    if (left + p.width > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - p.width;
    if (left < MARGIN) left = MARGIN;

    pop.style.top = `${Math.max(MARGIN, top)}px`;
    pop.style.left = `${left}px`;
    // Anchor the scale-in to the edge nearest the word so it opens out of the term.
    pop.style.transformOrigin = above ? 'bottom' : 'top';
  }

  function show(term) {
    const entry = terms[term.dataset.t];
    if (!entry) return; // unknown key — leave any current popover alone
    if (open && open !== term) open.setAttribute('aria-expanded', 'false');
    pop.textContent = entry.def;
    pop.classList.add('is-open');
    pop.setAttribute('aria-hidden', 'false');
    place(term); // measure AFTER content + is-open so the box has its real size
    term.setAttribute('aria-expanded', 'true');
    term.setAttribute('aria-describedby', popId);
    open = term;
  }

  function hide() {
    if (!open) return;
    pop.classList.remove('is-open');
    pop.setAttribute('aria-hidden', 'true');
    open.setAttribute('aria-expanded', 'false');
    open.removeAttribute('aria-describedby');
    open = null;
  }

  const termOf = (e) => (e.target instanceof Element ? e.target.closest('.term') : null);

  // Hover.
  rootEl.addEventListener('pointerover', (e) => { const t = termOf(e); if (t) show(t); }, listen);
  rootEl.addEventListener('pointerout', (e) => {
    const t = termOf(e);
    if (!t || (e.relatedTarget && t.contains(e.relatedTarget))) return; // ignore intra-term moves
    if (open === t && document.activeElement !== t) hide(); // keep open while keyboard-focused
  }, listen);

  // Keyboard focus (focusin/focusout bubble, unlike focus/blur — needed for delegation).
  rootEl.addEventListener('focusin', (e) => { const t = termOf(e); if (t) show(t); }, listen);
  rootEl.addEventListener('focusout', (e) => { const t = termOf(e); if (t && open === t) hide(); }, listen);

  // Click / tap opens it too (touch has no hover). We SHOW rather than toggle: a mouse click
  // fires focusin (show) then click, so toggling here would immediately hide it. Dismissal is
  // via Escape, blur, or tapping elsewhere (which blurs the button → focusout → hide).
  rootEl.addEventListener('click', (e) => { const t = termOf(e); if (t) show(t); }, listen);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { open?.blur(); hide(); } }, listen);
  // A scroll moves the term, so re-place the fixed popover to track it (capture: scrolls on
  // inner containers like the step card don't bubble to window).
  window.addEventListener('scroll', () => { if (open) place(open); }, { ...listen, capture: true });

  return () => { hide(); ac.abort(); };
}
