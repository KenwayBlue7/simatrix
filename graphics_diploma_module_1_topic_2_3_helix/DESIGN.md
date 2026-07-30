# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 2.3: Helix (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic: the construction-line colour encoding (reused
> byte-for-byte from Topic 2.1), the right/left-hand toggle (reused byte-for-byte from Topic
> 1.2/2.2), and the new hidden-line convention this topic's two-view construction needs.

---

## 1. Subject

Per ADR-080, this topic draws a genuinely 3D curve as two linked 2D orthographic views (first-
angle: front view above, top view below — RULES.md §4's citation), not a 3D scene. There is no
camera, no orbit — the "3D-ness" lives in the geometry (`constructions.js`'s real `x,y,z` points),
not the rendering.

## 2. Construction-line token map (reused byte-for-byte from Topic 2.1)

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the cylinder/cone outline, the base/top circle | `--color-construct-given` | `#5a5d66` | solid, standard weight | labelled dimensions (⌀, pitch, lead) |
| **Construction move** — division points, projector lines, wire cross-section circles | `--color-construct-move` | `#7b4fb5` (violet) | thin | division points render as small unlabelled dots; projectors are plain thin lines (not the dashed compass-mark style — a projector is a straightedge move, not a compass move) |
| **Result** — the traced helix curve(s) | `--color-construct-result` | `#1f8a4c` (green) | solid, **bold weight** (visible segments) | see §3 below for the hidden-line treatment |

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

## 3. Hidden-line convention (new this topic)

A cylindrical or conical helix's front-view projection continuously alternates between the near
half-turn (visible, solid) and the far half-turn (occluded by the solid it winds around, hidden).
This is standard engineering-drawing hidden-line convention (RULES §4's first-angle citation), and
is a **different axis from role** — a hidden segment is still `role: 'result'` (it's still part of
the answer curve, just behind the solid), so `renderConstruction.js`'s `'curve'` step kind gained
an independent `dashed` flag rather than inventing a fourth role:

| State | Stroke | Reveal |
|---|---|---|
| Visible (near half) | solid, `roleWidth × 1.1` | progressive stroke-dashoffset draw-on, same as every other traced curve in this track |
| Hidden (far half) | dashed (`3 2.5`), plain `roleWidth` | fades in at full opacity — a hidden-line segment reveals structure, it doesn't mime a drafting tool's motion, so the progressive draw-on (correct for the visible curve) is the wrong metaphor here |

The helical spring's two wire-boundary curves are drawn fully solid (no hidden-line split) — a
thin wire, unlike a solid shaft, doesn't self-occlude the way a cylinder's surface groove does;
this is the standard simplified teaching representation (see this topic's CLAUDE.md).

## 4. The right/left-hand toggle (reused byte-for-byte from Topic 1.2/2.2)

Same `.mode-toggle` / `.mode-toggle__btn` component (`#hand-toggle` here). Unlike Topic 2.2's
growth-law toggle, this one does **not** change which `given[]` fields exist — all three
constructions read `params.hand` unconditionally — so it needs no field-filtering logic in
`uiManager.js`, just the simpler always-visible toggle Topic 1.2 itself used.

Notes that bind this topic:

- **Chrome-Only Blue** still holds: `--color-accent` blue stays in the wizard/dock chrome only
  (including both toggles' pressed states) — never inside the construction viewport.
- **Flat-Ink / Border-Over-Shadow** still hold: the SVG construction area is flat.
- **Tabular Rule** still holds: every given/result numeric value — including the Sweep Angle
  slider's live `°` readout — reads in IBM Plex Mono with `tabular-nums`.
- The Sweep Angle control is a **plain `given[]` slider**, same as every prior topic in this set,
  not a bespoke in-viewport handle — keyboard-scrubbable for free.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
