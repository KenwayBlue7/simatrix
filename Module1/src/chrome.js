// chrome.js — Module 1 SHARED VIEWPORT CHROME (single injection point).
//
// Every page used to hard-code its in-viewport chrome (the legacy #orbit-hint) into
// its own HTML shell — seven copies that inevitably drift. This module injects the
// shared chrome into #sim-viewport ONCE, at boot, so a chrome change lands in one
// place. The engine calls injectChrome(#sim-viewport) between readTokens() and
// build() — i.e. BEFORE wire() queries the ids — so wire() can attach handlers.
//
// ── Injection scope ─────────────────────────────────────────────────────────
// The chrome is injected once; each piece is wired by its owning increment:
//   • #wizard-toggle                                  → Inc2 (engine setupWizardToggle)
//   • #vp-orbit-hint / #vp-spotlight / #vp-flow-note  → Inc3 (onboarding)
//   • .vp-cluster (quick-views, connector, Compare chip), #compare-card, #fa-symbol
//                                                     → Inc4 (Compare View / cinematic fold;
//                                                       engine setupCompareCard / setupQuickViews
//                                                       / setupConnectorToggle, revealed per cfg.ui)
//   • #sim-toast / #sim-context-lost                  → Inc5 (feedback / resilience)
// Cluster children + #compare-card + #fa-symbol carry `hidden` and are revealed by the
// engine only for lessons that opt in, so intro lessons stay clean.
//
// Markup ported from Module 2's index.html, adapted to Module 1 conventions: the
// screen-reader utility class is `.sr` here (not M2's `.sr-only`). No hard-coded
// colours — the CSS in shell.css drives every visual via the shared tokens.

// One shared HTML string. Hidden elements carry the `hidden` attribute so they are
// display:none until their owning increment reveals them — no CSS needed yet.
const CHROME_HTML = `
  <!-- Wizard collapse/expand chevron (top-right of the viewport). WIRED in Inc2. -->
  <button id="wizard-toggle" class="wizard-toggle" type="button"
          aria-controls="wizard" aria-expanded="true" title="Hide steps panel">
    <svg class="wizard-toggle__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6"/>
    </svg>
    <span class="sr">Toggle steps panel</span>
  </button>

  <!-- Top-left viewport cluster (Inc4): quick-view chips + connector toggle + Compare chip.
       Each child is hidden until the engine reveals it for a lesson that opts in (cfg.ui /
       cfg.mode / cfg.compareGate). -->
  <div class="vp-cluster">
    <div id="quick-views" class="qv-group" role="group" aria-label="Camera views" hidden>
      <button id="qv-top"   class="quick-view" type="button">Top</button>
      <button id="qv-front" class="quick-view" type="button">Front</button>
      <button id="qv-side"  class="quick-view" type="button">Side</button>
    </div>

    <button id="connector-toggle" class="vp-chip connector-toggle on" type="button" aria-pressed="true" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
           stroke-linecap="round" aria-hidden="true">
        <path d="M5 5v14M19 5v14" stroke-dasharray="3 3"/><path d="M5 12h14"/>
      </svg>
      <span class="chip__label">Projectors</span>
    </button>

    <button id="compare-chip" class="vp-chip compare-chip" type="button" aria-pressed="false" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/>
      </svg>
      <span class="chip__label">Compare 2D drawing</span>
    </button>
  </div>

  <!-- Compare card (Inc4): a floating "drawing sheet" frame. #c2d is NOT moved in here —
       layout() floats the canvas position:fixed over the .compare-card__stage rect
       (canvases never move in the DOM). compact / expanded via data-size. -->
  <div id="compare-card" class="compare-card" data-size="compact" hidden>
    <div class="compare-card__head">
      <span class="compare-card__tab">2D drawing</span>
      <button id="compare-expand" class="compare-card__btn" type="button" aria-label="Expand compare view" title="Expand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4"/>
        </svg>
      </button>
      <button id="compare-close" class="compare-card__btn" type="button" aria-label="Close compare view" title="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
    </div>
    <div class="compare-card__stage"></div>
  </div>

  <!-- First-angle projection symbol badge (Inc4): fades in while the sheet is folded flat,
       on lessons that opt in via cfg.ui.faSymbol (Points / Lines). -->
  <div id="fa-symbol" class="fa-symbol" aria-hidden="true" hidden>
    <svg viewBox="0 0 96 40" fill="none" stroke="currentColor" stroke-width="1.6"
         stroke-linejoin="round" aria-hidden="true">
      <path d="M8 8 L8 32 L40 26 L40 14 Z"/>
      <circle cx="66" cy="20" r="12"/><circle cx="66" cy="20" r="6"/>
    </svg>
  </div>

  <!-- Onboarding scaffolding (hidden, unwired — Inc3). -->
  <div id="vp-orbit-hint" class="vp-hint" role="status" hidden>
    <svg class="vp-hint__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
      <path d="M21 3.5v4h-4"/>
    </svg>
    <span>Drag to rotate the view</span>
    <button id="vp-orbit-dismiss" class="vp-hint__dismiss" type="button" aria-label="Dismiss hint">&times;</button>
  </div>

  <div id="vp-spotlight" class="vp-hint vp-spotlight" role="status" hidden>
    <span class="vp-spotlight__dot" aria-hidden="true"></span>
    <span class="vp-spotlight__text"></span>
    <button id="vp-spotlight-dismiss" class="vp-hint__dismiss" type="button" aria-label="Dismiss hint">&times;</button>
  </div>

  <div id="vp-flow-note" class="vp-note" aria-hidden="true" hidden>
    <svg class="vp-note__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 11v5"/>
      <path d="M12 7.5h.01"/>
    </svg>
    <span class="vp-note__text"></span>
  </div>

  <!-- Feedback / resilience scaffolding (hidden, unwired — Inc5). -->
  <div id="sim-toast" class="sim-toast" aria-hidden="true" hidden>
    <svg class="sim-toast__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="sim-toast__text"></span>
  </div>

  <div id="sim-context-lost" class="sim-restoring" role="status" hidden>
    <span>Restoring the 3D view&hellip;</span>
  </div>

  <!-- Workbench rail (Lines, via cfg.workbenchControls): the docked live-parameter strip that
       replaces the collapsed wizard while the expanded Compare split is open. Injected EMPTY +
       hidden; the engine re-parents the geometry-driver .ctrl fields into it on enter. It is the
       last child of #sim-viewport, so as a flex sibling after #canvas-area it docks at the bottom
       and #canvas-area (flex:1) shrinks by its height (the canvases resize via layout()). -->
  <div id="workbench-rail" role="group" aria-label="Live parameters" hidden></div>
`;

// Inject the shared chrome into the mount (#sim-viewport). Idempotent: a second call
// (e.g. a re-boot) is a no-op once #wizard-toggle is present.
export function injectChrome(mountEl){
  if(!mountEl || mountEl.querySelector('#wizard-toggle')) return;
  const frag = document.createElement('template');
  frag.innerHTML = CHROME_HTML.trim();
  mountEl.appendChild(frag.content);
}

// ── Step-card chrome (Inc5: feedback) ───────────────────────────────────────
// The inline two-state Reset confirm + the per-step done-badge live in the WIZARD's
// step card (not the viewport), so they are injected here rather than in CHROME_HTML.
// Injecting them — instead of hard-coding into all 7 HTML shells — keeps the shells
// drift-free. The engine calls injectCardChrome() at boot, before wire() binds the ids.
//
//   • #reset-confirm  → sits beside the ghost Reset inside the existing #reset-control;
//                       Back / Next step aside (CSS .is-reset-armed) while it is shown.
//   • #done-badge     → a quiet success tick inside .step-card, before the nav footer;
//                       the engine toggles .is-on per the active step's done() predicate.
const RESET_CONFIRM_HTML = `
  <div id="reset-confirm" class="reset-confirm" role="group" aria-label="Reset confirmation" hidden>
    <span class="reset-confirm__prompt">Reset everything?</span>
    <span class="reset-confirm__sep" aria-hidden="true">&middot;</span>
    <button id="btn-reset-yes" class="btn btn--ghost reset-confirm__action" type="button" aria-label="Yes, reset everything">Yes</button>
    <span class="reset-confirm__sep" aria-hidden="true">/</span>
    <button id="btn-reset-cancel" class="btn btn--ghost reset-confirm__action" type="button" aria-label="Cancel reset">Cancel</button>
  </div>`;
const DONE_BADGE_HTML = `
  <p id="done-badge" class="done-badge" aria-hidden="true">
    <svg class="done-badge__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="done-badge__text"></span>
  </p>`;

export function injectCardChrome(){
  const resetControl = document.getElementById('reset-control');
  if(resetControl && !document.getElementById('reset-confirm')){
    resetControl.insertAdjacentHTML('beforeend', RESET_CONFIRM_HTML.trim());
  }
  const card = document.querySelector('.step-card');
  const nav  = card?.querySelector('.card__nav');
  if(card && nav && !document.getElementById('done-badge')){
    nav.insertAdjacentHTML('beforebegin', DONE_BADGE_HTML.trim());
  }
}

// ── Problem Library chrome (Inc6) ───────────────────────────────────────────
// Injected ONLY for lessons that ship a `problems` config (Points / Lines) — the engine
// gates the call, so intro lessons never gain the markup. Two mounts:
//   • The "Practice problems" entry + the #active-problem panel sit ABOVE the .wizard-main
//     row (full width, above the step card + rail), so the pinned problem reads first.
//   • The full-viewport #problem-library overlay is appended to <body> (position:fixed
//     inset:0 — it must escape any ancestor overflow to cover the whole window).
// Markup ported from Module 2's index.html, adapted to Module 1 (the SR utility class is
// `.sr`; the "Complete & next problem" CTA lives in the panel, shown only on a green check).
// Split into the entry button (relocatable into the step card's eyebrow row, Module-2 style)
// and the pinned active-problem panel (always above the .wizard-main row).
const LIBRARY_ENTRY_HTML = `
  <button id="open-problem-library" class="library-entry" type="button" aria-haspopup="dialog">
    <svg class="library-entry__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5Z"/>
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5A1.5 1.5 0 0 1 20 20.5Z"/>
    </svg>
    <span>Practice problems</span>
  </button>`;
const LIBRARY_ACTIVE_HTML = `
  <section id="active-problem" aria-label="Current problem" hidden>
    <div class="active-problem__head">
      <p class="active-problem__eyebrow">Textbook problem</p>
      <button id="active-problem-toggle" class="btn btn--ghost active-problem__toggle" type="button" aria-expanded="true">Hide text</button>
    </div>
    <p class="active-problem__statement" id="active-problem-statement"></p>
    <button id="active-problem-hint-btn" class="btn btn--ghost active-problem__hint-btn" type="button" hidden>Need a hint?</button>
    <div class="active-problem__hints" id="active-problem-hints" hidden>
      <ol class="hint-steps" id="active-problem-hint-list"></ol>
    </div>
    <div class="active-problem__actions">
      <p class="match-status" id="active-problem-status"></p>
      <button id="exit-problem" class="btn btn--ghost" type="button">Exit problem</button>
    </div>
    <button id="problem-complete" class="btn btn--primary active-problem__complete" type="button" hidden>Complete &amp; next problem &rarr;</button>
  </section>`;

const LIBRARY_OVERLAY_HTML = `
  <div id="problem-library" class="problem-library" role="dialog" aria-modal="true" aria-labelledby="problem-library-title" hidden>
    <header class="problem-library__header">
      <h1 class="problem-library__title" id="problem-library-title">Practice problems</h1>
      <button id="problem-library-close" class="problem-library__close" type="button" aria-label="Close practice problems">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>
    <div id="problem-library-confirm" class="problem-library__confirm" role="group" aria-label="Confirm loading a problem" hidden>
      <span class="problem-library__confirm-text" id="problem-library-confirm-text">Loading this problem clears your current work.</span>
      <span class="reset-confirm__sep" aria-hidden="true">&middot;</span>
      <button id="problem-confirm-load" class="btn btn--ghost reset-confirm__action" type="button">Load problem</button>
      <span class="reset-confirm__sep" aria-hidden="true">/</span>
      <button id="problem-confirm-cancel" class="btn btn--ghost reset-confirm__action" type="button">Cancel</button>
    </div>
    <div class="problem-library__body">
      <div id="problem-library-list" class="problem-library__inner"></div>
    </div>
  </div>`;

export function injectLibraryChrome(){
  const wizard = document.getElementById('wizard');
  const main   = wizard?.querySelector('.wizard-main');
  // Entry button: prefer the step card's eyebrow row (beside "Step X of Y", Module-2 style);
  // fall back to above the .wizard-main row for shells without that row (e.g. Lines).
  if(!document.getElementById('open-problem-library')){
    const eyebrowRow = document.querySelector('.card__eyebrow-row');
    if(eyebrowRow) eyebrowRow.insertAdjacentHTML('beforeend', LIBRARY_ENTRY_HTML.trim());
    else if(main)  main.insertAdjacentHTML('beforebegin', LIBRARY_ENTRY_HTML.trim());
  }
  if(main && !document.getElementById('active-problem')){
    main.insertAdjacentHTML('beforebegin', LIBRARY_ACTIVE_HTML.trim());
  }
  if(!document.getElementById('problem-library')){
    document.body.insertAdjacentHTML('beforeend', LIBRARY_OVERLAY_HTML.trim());
  }
}
