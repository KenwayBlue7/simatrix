// Inline term-definition popover (DESIGN.md §5.7 "Inline term definition").
//
// Engineering vocabulary the struggling first-year may not know — HP, VP,
// quadrant, projector, first-angle — is marked up in the step copy
// (pointSteps.js) as a dotted-underline `.term` <button data-t="…"> whose key
// looks up the TERMS glossary. On hover, keyboard focus, or tap the definition
// appears in a small accent-wash popover; screen readers get it through
// `aria-describedby`.
//
// This topic keeps the Module-1 family's SINGLETON `#term-pop` element (the
// z-ladder's --z-term rung) rather than Module 2's per-term `.term__pop` spans:
// stepper.js re-renders the step body's HTML on every step change, so per-term
// popover spans and per-button listeners would be destroyed with each render.
// One fixed popover, filled from TERMS and driven by listeners DELEGATED from
// the stable `#wizard` container, survives every re-render with no re-wiring.
// (Ported from the Topic 2 sibling, which ported the placement behaviour from
// the master Module2/src/terms.js.) The popover is `position: fixed` so it
// escapes the step card's `overflow-y: auto` clip, opens below the term, flips
// above when there is not enough room, is clamped to the viewport horizontally,
// dismisses on Escape, and re-places on scroll so it tracks the term.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js calls initTerms()
// once at startup. It imports pointSteps.js the same pure-data way stepper.js
// does; it never touches the orchestrator or another behaviour leaf.

import { TERMS } from './pointSteps.js';

/** @returns {{ dispose: () => void }} */
export function initTerms() {
  const wizard = document.getElementById('wizard');
  const pop = document.getElementById('term-pop');
  if (!wizard || !pop) return { dispose: () => {} };

  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const MARGIN = 8; // keep the popover this far from the viewport edges

  /** The `.term` button currently showing the popover, or null. */
  let open = null;

  function hide() {
    if (!open) return;
    pop.classList.remove('is-open');
    open.removeAttribute('aria-describedby');
    open = null;
  }

  function show(term) {
    // A step change can re-render the body under an open popover, detaching the
    // button it was anchored to — drop the stale anchor instead of measuring it.
    if (!term.isConnected) { hide(); return; }
    const def = TERMS[term.dataset.t];
    if (!def) return;
    if (open && open !== term) hide();

    // Authored glossary copy (trusted, no user input — same trust boundary as
    // the step bodies stepper.js renders).
    pop.innerHTML = `<span class="term-pop__title">${def.label}</span>${def.def}`;
    term.setAttribute('aria-describedby', 'term-pop');

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
    // Origin-aware scale-in: anchor the growth to the edge nearest the term, so
    // the popover opens out of the word (the CSS default is top; flip above ⇒ bottom).
    pop.style.transformOrigin = placedAbove ? 'bottom' : 'top';
    pop.classList.add('is-open');
    open = term;
  }

  // Delegated from #wizard (the stable ancestor of every re-rendered body).
  const termFrom = (e) => e.target.closest?.('.term');

  wizard.addEventListener('mouseover', (e) => { const t = termFrom(e); if (t) show(t); }, listen);
  // Keep it open while the button is keyboard-focused even if the mouse leaves.
  wizard.addEventListener('mouseout', (e) => {
    const t = termFrom(e);
    if (t && t === open && document.activeElement !== t) hide();
  }, listen);
  wizard.addEventListener('focusin', (e) => { const t = termFrom(e); if (t) show(t); }, listen);
  wizard.addEventListener('focusout', (e) => { const t = termFrom(e); if (t && t === open) hide(); }, listen);
  // Tap/click toggles — covers touch browsers that do not focus a tapped button.
  wizard.addEventListener('click', (e) => {
    const t = termFrom(e);
    if (!t) return;
    e.preventDefault();
    if (open === t) hide(); else show(t);
  }, listen);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { open?.blur(); hide(); } }, listen);
  // A scroll moves the term, so re-place the fixed popover to track it (don't
  // dismiss: focusing a term can itself scroll it into view, which would close
  // the popover the focus just opened).
  window.addEventListener('scroll', () => { if (open) show(open); }, { capture: true, signal: ac.signal });

  return { dispose: () => { hide(); ac.abort(); } };
}
