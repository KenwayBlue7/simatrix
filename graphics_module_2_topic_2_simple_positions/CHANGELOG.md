# Changelog

All notable changes to Module 2 · Topic 2 (Simple Positions).

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
