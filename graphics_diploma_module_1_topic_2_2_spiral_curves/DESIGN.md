# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 2.2: Spiral Curves (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic: the construction-line colour encoding (reused
> byte-for-byte from Topic 2.1) and the growth-law toggle's visual spec (reused byte-for-byte
> from Topic 1.2).

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings do not apply here.

## 2. Construction-line token map (reused byte-for-byte from Topic 2.1)

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the pole and the growth law's stated radii | `--color-construct-given` | `#5a5d66` | solid, standard weight | labelled points (O…) |
| **Construction move** — the sweeping radius vector, the angle-arc auxiliary mark | `--color-construct-move` | `#7b4fb5` (violet) | thin, **dashed** | the radius vector is drawn solid-thin (a real line, not a compass mark) — only the angle-arc uses the dashed compass-mark styling |
| **Result** — the traced curve, and the tangent/normal built from it | `--color-construct-result` | `#1f8a4c` (green) | solid, **bold weight** | the traced curve gets a slightly bolder stroke (1.1× `roleWidth`, `renderConstruction.js`'s existing rule) — it is the one visual the whole topic is teaching |

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

## 3. The growth-law toggle (reused byte-for-byte from Topic 1.2)

Topic 1.2's segmented `.mode-toggle` / `.mode-toggle__btn` component, unchanged pixel-for-pixel
(pressed state fills `--color-accent`, unpressed reads `--color-ink-secondary` on `--color-paper`).
**Placement differs from Topic 1.2**: that topic's toggle sits on the Construct step, since its two
modes share one field set (internal/external tangency uses the same two circle-radius sliders
either way). This topic's toggle changes **which fields exist** (Archimedean needs Rmin/Rmax;
logarithmic needs Rmax/ratio/step-angle), so it has to resolve before the fields render — it sits
at the top of the Given step instead, immediately above `#given-fields`.

## 4. The tangent/normal visual (adapted from Topic 2.1's traced-curve pattern)

No literal polar-subtangent construction is drawn (see this topic's CLAUDE.md for why — at the
Archimedean spiral's outer radius that auxiliary triangle runs to several hundred millimetres
against a ~100mm curve). Instead: a short, bounded-length tangent segment and normal segment
through the traced point M (same "fixed local-length reach" pattern Topic 2.1 uses for its own
tangent/normal), plus a small angle-arc (role `move`, dashed compass-mark styling) between the
radius vector and the tangent, showing alpha directly rather than constructing it.

Notes that bind this topic:

- **Chrome-Only Blue** still holds: `--color-accent` blue stays in the wizard/dock chrome only
  (including the growth-law toggle's pressed state) — never inside the construction viewport.
- **Flat-Ink / Border-Over-Shadow** still hold: the SVG construction area is flat.
- **Tabular Rule** still holds: every given/result numeric value — including the Roll Angle
  slider's live `°` readout and the ratio field's decimal value — reads in IBM Plex Mono with
  `tabular-nums`.
- The Roll Angle control is a **plain `given[]` slider**, same as Topic 2.1, not a bespoke
  in-viewport handle — a native `<input type="range">` is already keyboard-scrubbable for free.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
