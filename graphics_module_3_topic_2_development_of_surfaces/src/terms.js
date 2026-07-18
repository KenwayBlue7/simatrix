// Inline term-definition behaviour (DESIGN.md "Inline hint & term definition").
//
// Restored from Module 2 (this template's source): the popover WIRING that turns every
// `.term` button in the markup into its definition popover. Engineering vocabulary the
// struggling first-year may not know is marked up in the HTML as a dotted-underline `.term`
// <button> wrapping its `.term__pop` popover, and defined on first appearance. Screen readers
// get the definition through `aria-describedby`; sighted users see the popover on hover,
// keyboard focus, or tap (a focused button receives focus on touch, so tap is covered by
// `focus`).
//
// The popover is `position: fixed` and placed here in JS rather than via CSS so it escapes
// the step card's `overflow-y: auto` clip (a definition low in a tall card would otherwise be
// cut off). It opens below the term, flipping above when there is not enough room, and is
// clamped to the viewport horizontally.
//
// STARTER TEMPLATE: `TERMS` is exported as an EMPTY object — a seam for a data-driven glossary
// (the shape Module 1 / the Points topic use) should you want one. The popover wiring above is
// markup-driven and needs no data, so it works as soon as you add `.term` buttons to index.html.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls initTerms() once at
// startup; the terms live in static markup (the wizard shows/hides their panels but never
// recreates them), so one pass wires them all.

/** Inline glossary entries for your subject's vocabulary. Empty stub — fill if you want a
 *  data-driven terms layer; the markup-driven popover wiring below does not require it. */
export const TERMS = {};

export function initTerms() {
  const terms = [...document.querySelectorAll('.term')];
  if (terms.length === 0) return;

  const MARGIN = 8; // keep the popover this far from the viewport edges
  let open = null;

  function hide() {
    if (!open) return;
    open.classList.remove('is-open');
    open = null;
  }

  function show(term) {
    if (open && open !== term) hide();
    const pop = term.querySelector('.term__pop');
    if (!pop) return;

    // Measure (the popover keeps layout while hidden: opacity/visibility, not
    // display:none), then place it relative to the viewport.
    const t = term.getBoundingClientRect();
    const p = pop.getBoundingClientRect();

    let top = t.bottom + 6;
    let placedAbove = false;
    if (top + p.height > window.innerHeight - MARGIN) {
      top = t.top - p.height - 6; // not enough room below: flip above the term
      placedAbove = true;
    }
    let left = t.left;
    if (left + p.width > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - p.width;
    if (left < MARGIN) left = MARGIN;

    pop.style.top = `${Math.max(MARGIN, top)}px`;
    pop.style.left = `${left}px`;
    // Origin-aware scale-in: anchor the growth to the edge nearest the term, so the
    // popover opens out of the word (the CSS default is top; flip to bottom above).
    pop.style.transformOrigin = placedAbove ? 'bottom' : 'top';
    term.classList.add('is-open');
    open = term;
  }

  for (const term of terms) {
    term.addEventListener('mouseenter', () => show(term));
    // Keep it open while the button is keyboard-focused even if the mouse leaves.
    term.addEventListener('mouseleave', () => { if (open === term && document.activeElement !== term) hide(); });
    term.addEventListener('focus', () => show(term));
    term.addEventListener('blur', hide);
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { open?.blur(); hide(); } });
  // A scroll moves the term, so re-place the fixed popover to track it (don't
  // dismiss: focusing a term can itself scroll it into view, which would close
  // the popover the focus just opened).
  window.addEventListener('scroll', () => { if (open) show(open); }, true);
}
