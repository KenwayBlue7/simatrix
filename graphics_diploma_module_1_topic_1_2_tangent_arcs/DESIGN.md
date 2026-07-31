# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.2: Tangent Arcs (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic. It is copied from Topic 1.1's own appendix
> (`graphics_diploma_module_1_topic_1_1_basic_constructions/DESIGN.md`) — the construction-line
> token map (§2) is byte-identical and reused unchanged; §3 below is new to this topic.

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings (`--color-hp-line` / `--color-vp-line` /
`--color-pp-line`) **do not apply here** and are not referenced by this topic's code.

## 2. Construction-line token map (reused from Topic 1.1, unchanged)

A construction has three roles a line/point/circle can play, and each needs its own colour
**plus** a second cue (Two-Cue Rule, root DESIGN.md §2.3) so meaning never rests on hue alone.

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the starting line/circle, stated by the problem | `--color-construct-given` | `#5a5d66` (= `--color-ink-secondary`, reused — no new hue needed) | solid, standard weight | labelled endpoints/centres (A, B, C…) |
| **Construction move** — a compass arc or straightedge guide line, drawn *during* the build | `--color-construct-move` | `#7b4fb5` (violet — Module 1's `--locus` role, DESIGN.md §2.2, reused for consistency across the platform's "construction aid" meaning) | thin, **dashed** | short arc marks only (never a full circle) — reads as a compass trace, not a finished edge |
| **Result** — the arc the construction was built to produce, **and its points of tangency** | `--color-construct-result` | `#1f8a4c` (green — Module 1's `--tl-green` role, DESIGN.md §2.2, reused for "the answer") | solid, **bold weight** | a filled endpoint dot + label |

Declared as real CSS custom properties in `index.html`'s `:root` (so `getComputedStyle` reads
them at runtime, RULES §4.2 — never a hard-coded hex in `renderConstruction.js`):

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

**No fourth token for points of tangency.** This topic's build prompt calls out marking and
labelling the point(s) of tangency as an explicit deliverable — it would be easy to read that as
needing its own colour. It doesn't: a point of tangency *is* the construction's result (the thing
the whole build exists to prove), not a separate category, so `constructions.js` marks it
`P(point, 'result', 'T1')` — the same `--color-construct-result` green + filled-dot-and-label cue
every other result point already uses (RULES §4.16 — never invent a token a reused one already
covers).

## 3. The internal/external tangency toggle (new to this topic)

"Tangent Arc Between Two Circles" is the one construction with two valid solutions for the same
given circles — external (the arc bulges apart from both) and internal (the arc encloses both).
The Construct step (`#mode-toggle`) exposes this as a **segmented two-button group**
(`.mode-toggle__btn[aria-pressed]`), not the platform's 18px drafting-square checkbox (root
DESIGN.md §5.4): a checkbox reads as on/off, but External and Internal are two named,
mutually-exclusive states, neither of which is the "off" position. The segmented-group pattern
already used for `aria-pressed` state elsewhere in this file family (`.construction-picker__item`)
is the better fit. Selected state uses the same accent fill as `.btn--primary` and `.rail__item.
is-current` — no new colour token.

Every other visual rule in root DESIGN.md — Quiet Chrome, Chrome-Only Blue, Flat-Ink,
Border-Over-Shadow, the Tabular Rule for every mm/° readout — applies unchanged.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
