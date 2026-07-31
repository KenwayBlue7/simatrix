# Changelog

All notable changes to Module 2 · Topic 2 (Simple Positions).

## 2026-07-31
- Added: "Finish lesson" button (Module 2 Finish-button pilot rollout — this topic is the exact twin of the pilot's own Step 6 "Flatten") — `#btn-finish` takes over the footer's primary slot at the terminal step exactly when `#btn-next` vacates it, enabled once flattened. Click posts `sim:complete` and announces "Lesson marked complete." (`main.js`, `src/stepper.js`, `index.html`.)
- Changed: `sim:complete` (`markComplete()`) drops its one-shot `window.__simComplete` latch — fires on every "Finish lesson" click now, replacing the old auto-fire on flatten. (`main.js`, `src/stepper.js`.)

## 2026-07-28
- Added: a new `markComplete()` posts `{ type: 'sim:complete' }` to `window.parent` once, fired on the first flatten (step 6) — the host's second sanctioned signal, for a "next topic / stay" overlay (ADR-078 addendum). (`main.js`, `src/stepper.js`.)

## 2026-07-27
- Changed: the Problem Library overlay's title now centers in its header row (was hard-left) — a 44px spacer counterweights the close button so it stays corner-anchored (ADR-082). (`index.html`.)

## 2026-07-25
- Fixed: the Compare split's floating "compact" card (its own title bar + expand/close buttons) could get stuck stranded at full window width after the viewport narrowed below 768px and then widened back — a one-way `matchMedia` listener demoted the split but never restored it. Removed the compact card entirely: Compare now has exactly one shape (the docked 50/50 split) at every viewport width, and below 768px the same grid restacks to a single column via CSS instead of switching UI (ADR-080, platform-wide). (`main.js`, `index.html`.)

## 2026-07-24
- Added: `markBooted()` now posts `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` resolves — the host loading screen's boot-ready signal (ADR-078, narrows ADR-002). (`main.js`.)

## 2026-07-20
- Changed: `--color-vp-line` darkened `#bc5d1e → #b25718` (platform-wide AA promotion, ~4.92:1 on paper) — `index.html` `:root`.

## 2026-07-16
- Fixed: dashed hidden-edge lines could bleed through coincident visible solid lines (e.g. the Cube's front/back faces project to the identical square) — backported the Master's `buildSegments()` fix, biasing dashed materials with `polygonOffset` and setting `renderOrder` so visible lines always paint over hidden ones, per drafting line-precedence convention.
- Added: Backported the full ADR-037 Compare 50/50 workbench (2D drawing sheet, drag-to-pan + scroll-zoom, docked driver rail, rail hide/reveal toggle) from the Module 2 Master — this clone previously had no Compare feature at all.
- Fixed: Step 6's "Flatten to 2D"/"Unfold to 3D" button could go stale after a Compare round-trip forced an unflatten behind its back; `stepper.js` now exposes `setFlattened()` and `enterWorkbench()` calls it to keep the button in sync.
- Changed: Step 6 button order now matches the Master (flatten → unfold → dimensions → complete-next) and the Dimensions button is white instead of accent-filled; its confirmation now goes out via a `flowNote` viewport toast instead of a panel done-badge.
- Verified: ADR-041 filled 3:1 dimension arrowheads were already present in `projectionDrawer.js` — no change needed.

## 2026-07-09
- Fixed: `#step-card` + `.problem-library__body` scrollbar pills actually shipped tinted `--color-accent` (the 2026-07-02 entry below described `--color-border`, but the accent tint landed in code) — WebKit thumb + Firefox `scrollbar-color` now read `var(--color-border)` per ADR-032.

## 2026-07-02
- Changed: Backported the floating minimal scrollbars (platform standard, DESIGN.md §5.11 / ADR-032) to `#step-card` and `.problem-library__body` — the hidden scrollbar (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`) is replaced by a 10px WebKit channel with a ~4px `--color-border` pill floating clear via a 3px transparent padding-box border, plus a Firefox `@supports` fallback, so learners get a "more content below" cue in the quiet Quiet-Chrome style. (This topic mirrors the Module 2 master's two scroll containers; it has no `#shape-rail`/`#anatomy-panel`.)
