# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.3: Tangent Lines (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic. It is copied from Topic 1.1's own appendix
> (`graphics_diploma_module_1_topic_1_1_basic_constructions/DESIGN.md`), same as Topic 1.2's was —
> the construction-line token map (§2) is byte-identical and reused unchanged; §3 below is new.

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings (`--color-hp-line` / `--color-vp-line` /
`--color-pp-line`) **do not apply here** and are not referenced by this topic's code.

## 2. Construction-line token map (reused from Topic 1.1/1.2, unchanged)

A construction has three roles a line/point/circle can play, and each needs its own colour
**plus** a second cue (Two-Cue Rule, root DESIGN.md §2.3) so meaning never rests on hue alone.

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the starting circle/point, stated by the problem | `--color-construct-given` | `#5a5d66` (= `--color-ink-secondary`, reused — no new hue needed) | solid, standard weight | labelled endpoints/centres (C, C1, C2, P…) |
| **Construction move** — an auxiliary/Thales circle, a radial guide line, or a compass mark drawn *during* the build | `--color-construct-move` | `#7b4fb5` (violet — Module 1's `--locus` role, DESIGN.md §2.2, reused for consistency across the platform's "construction aid" meaning) | thin, **dashed** | the auxiliary circle and its own centre (M) drawn distinctly from the given circles |
| **Result** — the tangent line(s) the construction was built to produce, **and their points of tangency** | `--color-construct-result` | `#1f8a4c` (green — Module 1's `--tl-green` role, DESIGN.md §2.2, reused for "the answer") | solid, **bold weight** | a filled endpoint dot + label |

Declared as real CSS custom properties in `index.html`'s `:root` (so `getComputedStyle` reads
them at runtime, RULES §4.2 — never a hard-coded hex in `renderConstruction.js`):

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

**No fourth token for points of tangency**, same reasoning as Topic 1.2: a point of tangency *is*
the construction's result, not a separate category — `constructions.js` marks it
`P(point, 'result', 'T1')`, reusing `--color-construct-result` (RULES §4.16 — never invent a
token a reused one already covers).

## 3. No mode toggle (unlike Topic 1.2 — noted for contrast)

Topic 1.2 gave "Tangent Arc Between Two Circles" a segmented `#mode-toggle` because the SAME two
circles have two valid arc solutions (external/internal), and flipping between them on one
drawing is the pedagogical point. This topic's internal/external confusion is real too — the
auxiliary circle's radius is `r1 − r2` vs. `r1 + r2` — but it sits between two genuinely different
tangent-LINE families (each with its own two-solution symmetry: every construction here already
draws both of ITS tangent lines side by side, using `circleIntersect`'s two roots), not one
construction with two readings. So the contrast is carried by the two constructions' adjacent
picker entries and their principle text (`constructions.js`), not a UI toggle — no new component,
no new token.

Every other visual rule in root DESIGN.md — Quiet Chrome, Chrome-Only Blue, Flat-Ink,
Border-Over-Shadow, the Tabular Rule for every mm/° readout — applies unchanged.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
