# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.5: Polygon-Circle Relations (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic. It is copied from Topic 1.1's own appendix — the
> construction-line token map (§2) is byte-identical and reused unchanged; §3 (the n-switcher)
> is new.

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings (`--color-hp-line` / `--color-vp-line` /
`--color-pp-line`) **do not apply here** and are not referenced by this topic's code.

## 2. Construction-line token map (reused from Topics 1.1-1.4, unchanged)

A construction has three roles a line/point/circle can play, and each needs its own colour
**plus** a second cue (Two-Cue Rule, root DESIGN.md §2.3) so meaning never rests on hue alone.

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the starting triangle/circle, stated by the problem | `--color-construct-given` | `#5a5d66` (= `--color-ink-secondary`, reused) | solid, standard weight | labelled points (A, B, C, O…) |
| **Construction move** — a compass arc, auxiliary circle, or ray drawn *during* the build | `--color-construct-move` | `#7b4fb5` (violet — Module 1's `--locus` role, DESIGN.md §2.2, reused) | thin, **dashed** | bisector rays, tangent construction arcs, division ticks |
| **Result** — the finished incircle/circumcircle/polygon | `--color-construct-result` | `#1f8a4c` (green — Module 1's `--tl-green` role, DESIGN.md §2.2, reused) | solid, **bold weight** | filled endpoint dots + letter labels |

Declared as real CSS custom properties in `index.html`'s `:root` (so `getComputedStyle` reads
them at runtime, RULES §4.2 — never a hard-coded hex in `renderConstruction.js`):

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

Every other visual rule in root DESIGN.md — Quiet Chrome, Chrome-Only Blue, Flat-Ink,
Border-Over-Shadow, the Tabular Rule for every mm/°/count readout — applies unchanged.

## 3. The n-switcher (new to this topic — narrower than Topic 1.4's method switcher)

`#n-switcher` is a segmented button group, visually identical to Topic 1.4's `#method-switcher`
(same active-state fill, same border treatment, same `flex: 1 1 0` even-division CSS) but a
**narrower** generalization: Topic 1.4 gave *every* construction a `methods` array (2-3 ways to
build the *same* polygon). This topic's pairing discipline is different (Topic 1.3's picker-pair
pattern — see CLAUDE.md), so only **one** of the four constructions, `superscribe-polygon`, needs
a switcher at all: its `n` is a genuinely discrete set (`{4, 6, 8, 12}` — the polygons reachable
by repeated angle bisection from a perpendicular-diameter or radius-chord-hexagon start), not a
contiguous range a `<input type="range">` slider can express. The other three constructions
(`incircle-triangle`, `circumcircle-triangle`, `inscribe-polygon`) declare no `nChoices` at all,
so `uiManager.js`'s `renderNSwitcher()` hides `#n-switcher` entirely for them — unlike Topic 1.4,
where the switcher showed unconditionally because every construction needed one.

Placement: inside the Construct step (step 3), above the Play button — same spot Topic 1.4's
method switcher used, and Topic 1.2's mode toggle before that. Selected state reuses
`--color-accent` fill, same as `.btn--primary` and `.rail__item.is-current` — no new colour
token, consistent with RULES §4.16.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
