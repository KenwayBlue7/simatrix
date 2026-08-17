# Changelog — Simatrix Starter Template

Notable changes to this template. (Module 2's history was intentionally not carried over —
this changelog starts fresh, per MODULE-STARTER §3.2.)

## 2026-07-31
- Fixed: retired the auto-fired, one-shot `markComplete()` shape (last file in the repo still carrying it) in favor of the platform-wide button-driven, latchless "Finish lesson" pattern. `main.js`'s `markComplete()` drops the `window.__simComplete` guard down to a one-line latchless post. `stepper.js` removes the `firstArrival`/`visited.has(TOTAL)` auto-fire from `goToStep()` and instead wires a new `#btn-finish` click listener (`markComplete()` + an announce), and adds the missing `markComplete` entry to the `sim` JSDoc typedef. Ungated — matches `graphics_module_1_topic_4_understanding_orthographic_views`'s ungated precedent, since this starter has no domain state to gate on; a real topic cut from this template should decide its own gate (see root `MODULE-STARTER.md` §3.11, added alongside this fix). (`main.js`, `src/stepper.js`.)
- Added: `#btn-finish` button in `.card__nav`, after `#btn-next` — same mutual-exclusivity idiom as every other migrated topic (`stepper.js`'s `renderNav()` hides one exactly when it shows the other). (`index.html`.)

## 2026-07-28
- Added: a new `markComplete()` posts `{ type: 'sim:complete' }` to `window.parent` once, fired on first arrival at the terminal step (step 3) — the host's second sanctioned outbound signal, for a "next topic / stay" overlay (ADR-078 addendum), so every future topic minted from this template inherits it. (`main.js`, `src/stepper.js`.)

## 2026-07-27
- Changed: the Problem Library overlay's title now centers in its header row (was hard-left) — a 44px spacer counterweights the close button so it stays corner-anchored (ADR-082), and future topics minted from this template inherit it. (`index.html`.)

## 2026-07-25
- Fixed: the Compare-split CSS/markup scaffolding still carried the dead floating "compact" card (title bar + expand/close buttons) that ADR-080 removed platform-wide — no `main.js` wiring existed here to trigger its resize-strand bug, but every new topic minted from this template would have re-seeded the dead chrome. Cleaned to the single-shape docked split (grid-area cell only) with a CSS-only single-column restack below 768px, matching every other Compare-card topic. (`index.html`.)

## 2026-07-24
- Added: `markBooted()` now posts `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` resolves — the host loading screen's boot-ready signal (ADR-078, narrows ADR-002), so every future topic minted from this template inherits it. (`main.js`.)

## 2026-07-20
- Changed: `--color-vp-line` darkened `#bc5d1e → #b25718` (platform-wide AA promotion, ~4.92:1 on paper) — `index.html` `:root`, so new topics minted from this template inherit the darker amber.

## 2026-07-11
- Added: Minted `template_starter/` from the Module 2 master — a dual-mode (guided-stepper +
  Compare workbench) scaffold with all Engineering-Graphics domain content stripped: the seven
  solid-geometry files removed, `problems.js`/`terms.js` emptied to stubs, and `stepper.js`
  reset to three placeholder steps.
- Added: Compare-view scaffolding (`#compare-card` + `#compare-canvas`, empty `#workbench-rail`,
  and the `.compare-card` / `body.compare-split` / `#workbench-rail` CSS) ported from the Points
  topic so the template is natively dual-mode capable.

## 2026-07-16
- Fixed: `.wizard-toggle` was pinned at the stale `.vp-cluster` clearance (`calc(44px +
  var(--space-5))`, ~68px down) instead of the plain top-corner inset (`var(--space-3)`) — it
  silently overlapped the compact Compare card's own top offset, which is derived assuming the
  shallow inset. Backported from the Module 2 master.
- Fixed: the Compare-split shell (`body.compare-split`, `#sim-viewport`, `#compare-card`,
  `#workbench-rail`) was still the pre-polish flat layout — no panel-gray shell tone/gap/padding,
  a flush borderless viewport and compare pane, and a plain flex-row rail. Backported the Module 2
  master's floating-rounded-card treatment: panel-gray shell with `--space-4` gap/padding; the
  viewport and rail both gain a hairline border + `--radius-md` + (viewport) `overflow:hidden`;
  the compare card keeps its base rounded paper-card look instead of a flush `border-left`.
  `#workbench-rail`'s internal control flow stays a generic wrapping row — deliberately *not*
  Module 2's tuned column-major 7-driver grid, since that's specific to its own control count.
- Fixed: `#workbench-rail .field[hidden]` used `display:block !important` (would break flex-laid
  fields); now `display:flex !important` to match the master.
- Added: the `.rail-toggle` Hide/Show control (CSS + `#rail-toggle` markup, a direct `<body>`
  child) was entirely missing from the template — there was no way to hide the docked driver rail
  for a full-screen 3D/2D read of the split. Backported as CSS+markup scaffolding only; a module
  wires the click handler when it wires the split (`main.js` stays untouched here).
- Changed: synced `DESIGN.md` (§5.12 wizard-toggle spec, §5.13 Compare-split workbench spec, and
  the "Compare is Module-1-only" claim in §7/§8 — now corrected to reflect Module 2 shipping it
  too) and `PLATFORM-RULES.md` (§2.10/§2.11 stale hex/token references, plus two new governing
  rules) so these universals are actually governed at the root, not just fixed in this one file.
