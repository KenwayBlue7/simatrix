# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.6: Ogee Curves (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic. It is copied from Topic 1.1's own appendix — the
> construction-line token map (§2) is byte-identical and reused unchanged; §3 (the draggable
> handle) is new.

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings (`--color-hp-line` / `--color-vp-line` /
`--color-pp-line`) **do not apply here** and are not referenced by this topic's code.

## 2. Construction-line token map (reused from Topics 1.1-1.5, unchanged)

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the starting lines, stated by the problem | `--color-construct-given` | `#5a5d66` (= `--color-ink-secondary`, reused) | solid, standard weight | labelled points (A, B, V…) |
| **Construction move** — a compass arc, guide line, or centre point drawn *during* the build | `--color-construct-move` | `#7b4fb5` (violet — Module 1's `--locus` role, DESIGN.md §2.2, reused) | thin, **dashed** | O1/O2/M points, guide perpendiculars |
| **Result** — the finished ogee curve | `--color-construct-result` | `#1f8a4c` (green — Module 1's `--tl-green` role, DESIGN.md §2.2, reused) | solid, **bold weight** | the two arcs read as one continuous S-shape |

Declared as real CSS custom properties in `index.html`'s `:root` (so `getComputedStyle` reads
them at runtime, RULES §4.2 — never a hard-coded hex in `renderConstruction.js`):

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

Every other visual rule in root DESIGN.md — Quiet Chrome, Chrome-Only Blue, Flat-Ink,
Border-Over-Shadow, the Tabular Rule for every mm/°/% readout — applies unchanged.

## 3. The draggable handle (new to this topic)

The one genuinely new interaction in this syllabus track (no Topic 1.1-1.5 construction ever
made a point INSIDE the drawing itself draggable — confirmed by grep before this topic was
built). It is styled deliberately UNDER the `--color-construct-move` (violet) token, never
`--color-accent` (blue) — **the Chrome-Only Blue Rule holds even for an interactive control**:
blue is reserved for the wizard/dock chrome, and this handle lives inside `#construction-svg`,
so it reads as construction content that happens to be draggable, not a stray piece of chrome
that wandered into the viewport.

- **Shape (Two-Cue Rule):** a solid violet dot (`r=3`) inside a larger dashed violet halo
  ring (`r=5.5`) — visually distinct from every plain `'move'`-role point in the same
  colour, which is a small dot with no halo. The halo is the "this one moves" cue; colour
  alone never carries it.
- **Hit target:** a fourth, fully transparent circle (`r=7.5`, ~4x the visible dot's area)
  carries the actual `pointerdown`/`pointermove`/keyboard listeners — the visible marks stay
  small (consistent with every other point in this topic family) while the draggable target
  stays comfortably large, the same "visible mark vs. generous hit area" split the platform's
  sliders and buttons already use elsewhere.
- **Cursor:** `grab` at rest, `grabbing` while dragging.
- **Focus ring:** the ONE exception to "no blue in the viewport" — a keyboard focus
  indicator is not a domain colour, it is the platform's universal "you are here" signal
  (`--color-accent`), so the handle's hit-target shows the same accent `drop-shadow` ring on
  `:focus-visible` every other focusable control on the platform shows. This is a focus
  AFFORDANCE, not construction content, so it does not violate the rule the way a blue
  domain line would.
- **Keyboard (PRODUCT.md §7 accessibility commitment — not drag-only):** `role="slider"`,
  `aria-valuemin`/`aria-valuemax`/`aria-valuenow`/`aria-valuetext` kept in sync every commit;
  ArrowUp/ArrowRight increments by the bound param's `step`, ArrowDown/ArrowLeft decrements,
  Home/End jump to min/max — identical semantics to a native `<input type="range">`, so a
  keyboard user already knows how to operate it without new instructions.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
