# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 2.1: Roulettes (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic: the construction-line colour encoding (reused
> byte-for-byte from Topic 1.1) and the new traced-curve visual spec.

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings do not apply here.

## 2. Construction-line token map (reused byte-for-byte from Topic 1.1)

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the base line/circle and rolling circle at its start position | `--color-construct-given` | `#5a5d66` | solid, standard weight | labelled points (O, A, B…) |
| **Construction move** — the rolling circle at the current roll angle, and the classical cycloid's auxiliary arc/perpendicular | `--color-construct-move` | `#7b4fb5` (violet) | thin, **dashed** | never a full opaque circle — the rolling circle at `theta` renders at the same weight/style as every other 'move' element |
| **Result** — the traced curve, and the tangent/normal built from it | `--color-construct-result` | `#1f8a4c` (green) | solid, **bold weight** | the traced curve gets a slightly bolder stroke than other result lines (1.1× `roleWidth`) — it is the one visual the whole topic is teaching |

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

## 3. The traced-curve visual (new this topic)

No prior topic in this track (1.1–1.6) ever drew a curve that isn't a compass-constructible
point/line/arc/circle — a roulette is a genuine locus. `renderConstruction.js` gained a `'curve'`
step kind (this topic's own CLAUDE.md records the reasoning): a sampled polyline (`<path>` of `L`
segments through 140–160 points), drawn with the same stroke-dashoffset "draws itself" animation
as a straight line, sized to the polyline's own cumulative length so it reads at the same visual
rate a line or arc does. No new colour token — it uses `--color-construct-result` like any other
result element, just a hair bolder (`roleWidth × 1.1`) since it is the construction's centrepiece.

Notes that bind this topic:

- **Chrome-Only Blue** still holds: `--color-accent` blue stays in the wizard/dock chrome only.
- **Flat-Ink / Border-Over-Shadow** still hold: the SVG construction area is flat.
- **Tabular Rule** still holds: every given/result numeric value reads in IBM Plex Mono with
  `tabular-nums` — including the Roll Angle slider's live `°` readout.
- The Roll Angle control is a **plain `given[]` slider**, not a bespoke in-viewport handle
  (unlike Topic 1.6's ogee-curve reversal-point handle) — it is a scalar like any other given
  value, and a native `<input type="range">` is already keyboard-scrubbable (arrow keys, Home/
  End) for free, satisfying PRODUCT.md §7's accessibility commitment with zero new interaction
  code. See this topic's CLAUDE.md for the full reasoning.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
