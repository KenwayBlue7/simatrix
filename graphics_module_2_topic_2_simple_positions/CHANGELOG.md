# Changelog

All notable changes to Module 2 · Topic 2 (Simple Positions).

## 2026-07-09
- Fixed: `#step-card` + `.problem-library__body` scrollbar pills actually shipped tinted `--color-accent` (the 2026-07-02 entry below described `--color-border`, but the accent tint landed in code) — WebKit thumb + Firefox `scrollbar-color` now read `var(--color-border)` per ADR-032.

## 2026-07-02
- Changed: Backported the floating minimal scrollbars (platform standard, DESIGN.md §5.11 / ADR-032) to `#step-card` and `.problem-library__body` — the hidden scrollbar (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`) is replaced by a 10px WebKit channel with a ~4px `--color-border` pill floating clear via a 3px transparent padding-box border, plus a Firefox `@supports` fallback, so learners get a "more content below" cue in the quiet Quiet-Chrome style. (This topic mirrors the Module 2 master's two scroll containers; it has no `#shape-rail`/`#anatomy-panel`.)
