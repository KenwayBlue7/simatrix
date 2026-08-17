// Inline term-definition behaviour (DESIGN.md §5.7 / PRODUCT.md principle 5 — "provide an
// inline explanation the first time a term appears, but never replace the term itself").
// EXTRACTED mechanics, byte-identical in spirit to every other Diploma topic's terms.js —
// only the TERMS data below is new (this topic's own vocabulary).
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls initTerms() once at
// startup.

export const TERMS = {
  development: 'The flat pattern obtained by unrolling every surface of a solid onto a plane — every line on it must be a TRUE length (K.C. John Ch.15).',
  'stretch-out line': 'The base line of a development, whose length equals the solid’s own base perimeter (a prism) or base circumference (a cylinder) — the foundation the whole pattern is built on.',
  'fold line': 'A thin line on a development marking where the flat pattern folds to form an edge of the solid — drawn THIN, unlike the pattern’s own THICK outline (K.C. John Ch.15, Tools note #4).',
  seam: 'The joint edge where a development’s two ends meet once folded back into the solid — always located and named first, at the left corner, before the rest of the pattern is drawn.',
  generator: 'One of the straight lines running the length of a cylinder’s (or one face of a prism’s) surface, parallel to its axis — a cylinder’s development is normally divided into twelve equal generators.',
  mitre: 'The straight, angled joint line where two pipe pieces of the same diameter meet — for a 90° elbow shared between two pieces, each piece is cut at 45°.',
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
