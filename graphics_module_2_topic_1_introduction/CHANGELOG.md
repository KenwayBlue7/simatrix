# Changelog

All notable changes to Module 2 · Topic 1 (Introduction).

## 2026-07-09
- Fixed: `#shape-rail` + `#anatomy-panel` scrollbar pills actually shipped tinted `--color-accent` (the 2026-07-02 entry below described `--color-border`, but the accent tint landed in code) — WebKit thumb + Firefox `scrollbar-color` now read `var(--color-border)` per ADR-032.

## 2026-07-02
- Changed: Backported the floating minimal scrollbars (platform standard, DESIGN.md §5.11 / ADR-032) to `#shape-rail` and `#anatomy-panel` — the hidden scrollbar (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`) is replaced by a 10px WebKit channel with a ~4px `--color-border` pill floating clear via a 3px transparent padding-box border, plus a Firefox `@supports` fallback, so learners get a "more content below" cue in the quiet Quiet-Chrome style.
