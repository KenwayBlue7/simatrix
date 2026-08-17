# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.1: Basic Constructions (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic: the construction-line colour encoding, since a
> compass-and-straightedge construction has no HP/VP/PP planes to draw on.

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings (`--color-hp-line` / `--color-vp-line` /
`--color-pp-line`) **do not apply here** and are not referenced by this topic's code.

## 2. Construction-line token map (the only encoding this topic adds)

A construction has three roles a line/point can play, and each needs its own colour **plus** a
second cue (Two-Cue Rule, root DESIGN.md §2.3) so meaning never rests on hue alone.

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the starting line/angle/arc, stated by the problem | `--color-construct-given` | `#5a5d66` (= `--color-ink-secondary`, reused — no new hue needed) | solid, standard weight | labelled endpoints (A, B, O…) |
| **Construction move** — a compass arc or straightedge guide line, drawn *during* the build | `--color-construct-move` | `#7b4fb5` (violet — matches Module 1's existing `--locus` role, DESIGN.md §2.2, reused for consistency across the platform's "construction aid" meaning) | thin, **dashed** | short arc marks only (never a full circle) — reads as a compass trace, not a finished edge |
| **Result** — the line/point the construction was built to produce | `--color-construct-result` | `#1f8a4c` (green — matches Module 1's existing `--tl-green` role, DESIGN.md §2.2, reused for "the answer line") | solid, **bold weight** | a filled endpoint dot + label |

Declared as real CSS custom properties in `index.html`'s `:root` (so `getComputedStyle` reads
them at runtime, RULES §4.2 — never a hard-coded hex in `renderConstruction.js`):

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

Notes that bind this topic:

- **Chrome-Only Blue** still holds: `--color-accent` blue stays in the wizard/dock chrome only;
  no blue appears inside the construction viewport (root DESIGN.md §2.3).
- **Flat-Ink / Border-Over-Shadow** still hold: the SVG construction area is flat, no drop
  shadows on any drawn element; structure comes from the hairline card border only.
- **Tabular Rule** still holds: every given/result numeric value (length in mm, angle in
  degrees, *n*) reads in IBM Plex Mono with `tabular-nums`.
- Reusing the existing `--locus` (violet) and `--tl-green` (green) *hues* for this topic's
  construction-move/result roles — rather than inventing two more new hues — keeps "violet =
  construction aid" and "green = the derived result" consistent with what Module 1's Lines sim
  already established (DESIGN.md §2.2), even though this topic defines its own token names for
  them (a construction sheet's roles don't map 1:1 onto Lines' `--locus`/`--tl-green` meanings).

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
