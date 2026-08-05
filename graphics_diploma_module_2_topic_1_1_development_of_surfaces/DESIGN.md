# DESIGN.md — Diploma Engineering Graphics, Module 2 Topic 1.1: Development of Surfaces (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic: the construction-line colour encoding (reused
> byte-for-byte from the rest of the Diploma track), the outline/fold stroke-weight axis this
> topic's patterns need, and the Canvas2D viewport itself (ADR-112 §1 — this track's first).

---

## 1. Subject

This topic draws the flat pattern (development) of three solids — a rectangular prism, a cylinder,
and a two-piece 90° pipe elbow — by the Parallel-Line method (K.C. John Ch.15 / Bhatt Ch.15): a
front view, a top view (or auxiliary circle), and the unrolled stretch-out pattern, connected by
horizontal transfer lines that carry every true height across from the front view into the
development. There is no camera, no orbit, no third dimension in the rendering — every construction
here is genuinely flat, unlike Topic 2.3's helix (which draws a real 3D curve in 2D projection).

## 2. Canvas2D viewport (ADR-112 §1 — this track's first)

Every other Diploma topic's viewport is inline SVG. This topic's is ONE `<canvas>`
(`#construction-canvas`) — the front view, top view, and development all live on it as a single
continuous plate, so a transfer line can run straight from the front view into the development the
way the source textbooks actually draw it (an SVG viewport split into two separate elements cannot
do this without a second synced coordinate transform). `viewTransform.js` and
`renderConstruction.js` are reimplemented against `CanvasRenderingContext2D` but keep the same
external contract every other topic's versions expose — see both files' own header comments for the
substitution details (dash-offset draw-on ports directly via `ctx.setLineDash`/`lineDashOffset`;
pan/zoom becomes a view-state + a `project()` main.js builds fresh each paint, the same ADR-053
fixed-intrinsic-frame pattern the KTU-track Compare sheet already uses elsewhere in this repo).

**Do not "fix" this back to SVG** citing ADR-095/097 consistency — see ADR-112 for the full
reasoning; the SVG choice on every other topic was correct for subjects with no multi-view
single-plate transfer-line requirement, which this topic has.

## 3. Construction-line token map (reused byte-for-byte from the rest of the track)

| Role | Token | Value | Meaning |
|---|---|---|---|
| **Given** — the solid's own outline in the front/top view | `--color-construct-given` | `#5a5d66` | what the problem states |
| **Construction move** — projectors, transfer lines | `--color-construct-move` | `#7b4fb5` (violet) | thin, dashed, fades in — a straightedge move, not a compass move |
| **Result** — the development pattern itself | `--color-construct-result` | `#1f8a4c` (green) | the answer being built |

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

## 4. Outline / fold stroke-weight axis (new this topic)

K.C. John Ch.15's "Tools to solve development problems" note #4: *the outline of the developed
surface is thick, the folding is thin.* This is a stroke-**weight** axis, independent of a step's
`role` (role already means something else — pedagogical given/move/result significance, and a fold
line is still `role: 'result'`, part of the answer pattern, just drawn thin). Every step in
`constructions.js` that needs this distinction carries an explicit `weight`:

| Constant | Value (drawing units) | Used for |
|---|---|---|
| `OUTLINE_W` | 1.8 | The pattern's own outer boundary (and the front/top view's own outline) |
| `FOLD_W` | 0.6 | Interior fold lines / generator lines on the development |

`renderConstruction.js`'s `strokeWidthFor(step)` reads `step.weight` first, falling back to the
role's own default width only when a step doesn't specify one (every other Diploma topic's steps
never set `weight`, so they're unaffected).

## 5. The `'polyline'` step kind (new this topic)

A straight-segment, sharp-cornered path — distinct from `'curve'` (a sampled locus, e.g. Topic
2.3's helix, drawn with rounded joins). The development pattern's outline needs sharp corners
(a rectangle, or a rectangle with a mitred/cut notch), so it is its own kind rather than overloading
`'curve'`'s traced-locus semantics or `'line'`'s two-point-only shape.

Notes that bind this topic:

- **Chrome-Only Blue** still holds: `--color-accent` blue stays in the wizard/dock chrome only,
  never inside the construction canvas.
- **Flat-Ink / Border-Over-Shadow** still hold: the canvas construction area is flat.
- **Tabular Rule** still holds: every given/result numeric value reads in IBM Plex Mono with
  `tabular-nums` — inside the canvas too (`paintDim`/`paintLabel` set `ctx.font` from the resolved
  `--font-mono` token, matching the wizard dock's own CSS rule).
- No hand toggle on this topic (unlike Topic 2.3) — none of the three constructions have a
  handedness axis.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
