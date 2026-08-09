# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 2.4: Involutes (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic: the construction-line colour encoding (reused
> byte-for-byte from Topic 2.1, which reused it from Topic 1.1) and the traced-curve visual spec
> (also reused from Topic 2.1 — the involute-of-a-circle construction needs the same `'curve'`
> step kind that topic's rolling curves do).

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings do not apply here.

## 2. Construction-line token map (reused byte-for-byte from Topic 2.1 / Topic 1.1)

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the base circle/polygon | `--color-construct-given` | `#5a5d66` | solid, standard weight | labelled points (O, A, B, C…) |
| **Construction move** — the compass arc mid-sweep, the unwinding string's intermediate position | `--color-construct-move` | `#7b4fb5` (violet) | thin, **dashed** | never a full opaque shape — matches every other 'move' element's weight/style |
| **Result** — the traced curve/final arc, and the tangent/normal built from it | `--color-construct-result` | `#1f8a4c` (green) | solid, **bold weight** | the traced curve gets a slightly bolder stroke than other result lines (1.1× `roleWidth`) — it is the one visual the whole topic is teaching |

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

## 3. The traced-curve visual (reused from Topic 2.1)

Topic 2.1 (Roulettes) added a `'curve'` step kind to `renderConstruction.js` — a sampled polyline
(`<path>` of `L` segments through 140–160 points), drawn with the same stroke-dashoffset "draws
itself" animation as a straight line, sized to the polyline's own cumulative length so it reads at
the same visual rate a line or arc does — because a roulette (and, here, the involute of a circle)
is a genuine locus, not a compass-constructible point/line/arc/circle. This topic's involute-of-a-
circle construction is the reason it needed to be duplicated here (RULES §1.4); involute-of-a-
polygon needs no `'curve'` step at all — its whole curve is a chain of `'arc'` steps. No new colour
token — it uses `--color-construct-result` like any other result element, just a hair bolder
(`roleWidth × 1.1`).

Notes that bind this topic:

- **Chrome-Only Blue** still holds: `--color-accent` blue stays in the wizard/dock chrome only.
- **Flat-Ink / Border-Over-Shadow** still hold: the SVG construction area is flat.
- **Tabular Rule** still holds: every given/result numeric value reads in IBM Plex Mono with
  `tabular-nums` — including the Roll Angle slider's live `°` readout (involute of a circle only).
- The Roll Angle control (involute of a circle only) is a **plain `given[]` slider**, not a
  bespoke in-viewport handle — it is a scalar like any other given value, and a native
  `<input type="range">` is already keyboard-scrubbable (arrow keys, Home/End) for free,
  satisfying PRODUCT.md §7's accessibility commitment with zero new interaction code.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
