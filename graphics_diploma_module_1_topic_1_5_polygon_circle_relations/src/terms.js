// Inline term-definition behaviour (DESIGN.md §5.7 / PRODUCT.md principle 5 — "provide an
// inline explanation the first time a term appears, but never replace the term itself").
//
// Data-driven (Module 1 family pattern): TERMS holds this topic's own vocabulary — only
// words actually used in this topic's step copy, not the full constructions glossary. Each
// `.term` button in the markup carries `data-term="<id>"`; this module fills its `.term__pop`
// child from TERMS at init time, then wires the shared hover/focus/tap/Escape behaviour.
//
// Mechanics copied verbatim from Topics 1.1-1.4 — only the TERMS data below is this
// topic's own.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls initTerms() once at
// startup.

export const TERMS = {
  incircle: 'The largest circle that fits entirely inside a shape, touching every side exactly once — also called the inscribed circle.',
  circumcircle: 'The one circle that passes through every vertex of a shape — also called the circumscribed circle.',
  tangent: 'Touching a curve at exactly one point, without ever crossing it.',
  constructible: 'Buildable with only a compass and straightedge, no protractor — true for a square, hexagon, or octagon, but not for most polygons (a regular heptagon, for instance, cannot be built this way at all, only closely approximated).',
};

export function initTerms() {
  const terms = [...document.querySelectorAll('.term[data-term]')];
  if (terms.length === 0) return;

  for (const term of terms) {
    const id = term.dataset.term;
    const def = TERMS[id];
    const pop = term.querySelector('.term__pop');
    if (def && pop) {
      pop.textContent = def;
      pop.id = `term-pop-${id}`;
      pop.setAttribute('role', 'tooltip');
      term.setAttribute('aria-describedby', pop.id);
    }
  }

  const MARGIN = 8;
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

    const t = term.getBoundingClientRect();
    const p = pop.getBoundingClientRect();

    let top = t.bottom + 6;
    let placedAbove = false;
    if (top + p.height > window.innerHeight - MARGIN) {
      top = t.top - p.height - 6;
      placedAbove = true;
    }
    let left = t.left;
    if (left + p.width > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - p.width;
    if (left < MARGIN) left = MARGIN;

    pop.style.top = `${Math.max(MARGIN, top)}px`;
    pop.style.left = `${left}px`;
    pop.style.transformOrigin = placedAbove ? 'bottom' : 'top';
    term.classList.add('is-open');
    open = term;
  }

  for (const term of terms) {
    term.addEventListener('mouseenter', () => show(term));
    term.addEventListener('mouseleave', () => { if (open === term && document.activeElement !== term) hide(); });
    term.addEventListener('focus', () => show(term));
    term.addEventListener('blur', hide);
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { open?.blur(); hide(); } });
  window.addEventListener('scroll', () => { if (open) show(open); }, true);
}
