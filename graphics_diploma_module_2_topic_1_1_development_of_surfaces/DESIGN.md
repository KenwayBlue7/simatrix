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

## 3. Construction-line token map — Phase 1 rebuild (2026-08-06, supersedes the same-day audit fix below)

A same-day audit fix (aliasing `given`→`--color-ink`, adding text knockouts — history kept in this
section's tail) turned out not to close the visual gap against Module2's Show Method sheet. Reading
Module2's actual drawing code end-to-end (`Module2/main.js`'s `drawMethodSheet` + helpers) surfaced
the real defects: everything was painted in DRAWING units under a scaled `ctx` transform (so stroke
weight/font size scaled with zoom — the outline/fold convention only held at one zoom level), no
tier dropped back to auxiliary (three saturated hues read as equal weight), and the plate carried
almost no textbook annotation. Full rebuild, solid-by-solid (Prism first) — see
`../DECISIONS.md`'s ADR for this pass.

`move` no longer carries its own hue. Module2 never gives a purely auxiliary construction mark
(a projector, a reference line) its own saturated colour — it drops every one of them to
`--color-ink-secondary` and carries their MEANING in **dash pattern** instead
(`Module2/main.js`'s within-Set-projector `[2,2]` vs. carried-from-previous-Set `[8,4]` split).
Ported here as four named dashes (`renderConstruction.js`'s `DASH_DATUM/HIDDEN/PROJECT/CARRY`):

| Dash | Pattern | Meaning |
|---|---|---|
| `DASH_DATUM` | `[1]` | a reference/construction mark that isn't itself a drawn edge (dimension extension lines) |
| `DASH_HIDDEN` | `[5,4]` | hidden geometry (not yet used by this topic's three constructions) |
| `DASH_PROJECT` | `[2,2]` | a projector linking two views of the SAME region (default for any 'move'-role line) |
| `DASH_CARRY` | `[8,4]` | a transfer line carrying a measurement into a DIFFERENT region (`dash: 'carry'`) |

| Role | Token | Value | Meaning |
|---|---|---|---|
| **Given** — the solid's own outline in the front/top view | `--color-construct-given` | `var(--color-ink)` (≈`#06070b`) | what the problem states |
| **Construction move** — projectors, transfer lines | `--color-construct-move` | `var(--color-ink-secondary)` (≈`#5a5d66`) | auxiliary tier; meaning carried by dash, not hue |
| **Result** — the development pattern itself | `--color-construct-result` | `#1f8a4c` (green) | the answer being built |

```css
--color-construct-given:  var(--color-ink);
--color-construct-move:   var(--color-ink-secondary);
--color-construct-result: #1f8a4c;
```

The retired violet was `#7b4fb5`.

**Screen-space paint (the actual mechanical fix).** `main.js`'s `paint()` no longer bakes pan/zoom
into `ctx`'s transform — it stays DPR-only for the whole paint. Every `renderConstruction.js` helper
instead takes a `sheet` object (`{ project(p)->{x,y}, pxPerUnit, given, move, result, ink,
inkSecondary, paper, fontSans, fontMono }`, Module2's own `projectSheet`/`pxPerUnit` shape) and calls
`sheet.project()` on every point immediately before drawing it. Two kinds of numbers must never be
confused: REAL GEOMETRY (line endpoints, circle/arc radii) lives in drawing-space units and is
scaled by `pxPerUnit`; UI CHROME (stroke width, font size, point-dot radius, arrowhead size, dash
lengths, the ruler/compass tool overlay) is a literal canvas-px constant, same as Module2's
`ARC_LABEL_GAP_PX`. This is what actually fixes the thick/thin convention breaking at other zoom
levels — a `ctx.lineWidth = 1.8` under a baked-in `ctx.scale()` meant 1.8 WORLD units, i.e. 1.8px
only at one particular zoom.

**Fit budget reserves its own annotation.** `constructions.js`'s `planPlate()` gained fixed reserve
bands (`RESERVE_TOP/BOTTOM/LEFT/RIGHT`) subtracted from the available fit BEFORE `scale` is derived
— dims, captions, and numeral rows all live outside a block's own geometric bbox, and without a
reserve they overhang the plate (Module2 hit this exact bug class in ADR-102, a Set caption's own
offset left out of its own fit). Caught live during Phase 1 verification: the elbow's "short leg"
dim text clipped its leading digit at slider max — the reserve bands are generous fixed constants,
not a measured bbox (ADR-053/054's intrinsic-only law), so a genuinely worst-case long dim string at
a construction's own tightest intrinsic scale is the thing they're sized against.

**Label/dim-text knockout**, ported from Module2's `drawMethodLabels`/`strokeAngleArc` pattern
(technique only, not the file): every text draw in `renderConstruction.js` (`paintLabel`,
`paintPoint`'s label branch, `paintDim`'s value text, and the new `paintNumeral`/`paintNote`) fills
a `--color-paper` knockout rect behind the text before drawing it, sized from the measured text
width at a centred/middle baseline (`drawKnockoutText`, the one shared helper every text-drawing
`paint*` function now calls).

## 4. Outline / fold stroke-weight axis

K.C. John Ch.15's "Tools to solve development problems" note #4: *the outline of the developed
surface is thick, the folding is thin.* This is a stroke-**weight** axis, independent of a step's
`role` (role already means something else — pedagogical given/move/result significance, and a fold
line is still `role: 'result'`, part of the answer pattern, just drawn thin). Every step in
`constructions.js` that needs this distinction carries an explicit `weight`, now literal canvas px
(Phase 1 — previously drawing units, see §3 above):

| Constant | Value (canvas px) | Used for |
|---|---|---|
| `OUTLINE_W` | 1.6 | The pattern's own outer boundary (and the front/top view's own outline) |
| `FOLD_W` | 0.9 | Interior fold lines / generator lines on the development |

`renderConstruction.js`'s `strokeWidthFor(step)` reads `step.weight` first, falling back to the
role's own default width only when a step doesn't specify one (`given`/`result` → `OUTLINE_W`,
`move` → `0.75`, `renderConstruction.js`'s `AUX_PX`).

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
- **`.vp-hint` sits bottom-left, not this track's usual top-left** (2026-08-06) — the only
  intentional divergence from the other 9 Diploma topics' identical `.vp-hint` rule. Forced by
  the Compare chip (§ above) now owning top-left with host-chrome clearance; values match the
  two KTU topics that already use bottom-left (`graphics_module_1_topic_1_foundations` /
  `_topic_2_spatial_framework`). A `body.compare-split #sim-viewport > .vp-hint` override steps
  the hint above `#rail-toggle`, which parks in the same corner while the Compare split is open.

## 6. `'numeral'` / `'note'` / `'caption'` step kinds (Phase 1 rebuild)

Every source figure in this chapter (Bhatt Fig. 15.1/15-10, K.C. John Fig. 15.4/15.7) numbers
every corner/generator it draws on BOTH the views and the development, and carries `Seam`/
`Fold line`/`Inside pattern` leader callouts and a region caption under each block. Three step
kinds carry this, all knockout-backed via the same `drawKnockoutText` helper as `'label'`/`'dim'`:

| Kind | Shape | Tier | Notes |
|---|---|---|---|
| `'numeral'` | `{p, text, place}` | always `ink` | a station identifier is not part of the given/move/result pedagogical axis; `place` (`'above'\|'below'\|'left'\|'right'`) picks a fixed-px offset direction |
| `'note'` | `{p, to, text}` | always `inkSecondary` | leader callout — thin auxiliary-tier line from the text anchor (`p`) to the point it names (`to`), small terminating dot at `to` |
| `'caption'` | `{p, text}` | `inkSecondary`, NOT knockout-backed | Module2's own per-Set caption treatment (`drawMethodSheet`'s "Set caption" block) — plain text, since it lives in `planPlate`'s reserve band, never over crossing geometry |

Currently only `buildPrism` emits these (this rebuild is solid-by-solid); the cylinder/elbow
builders gain their own annotation in their own phase.

**The 3D prism (Compare pane) carries the same digits (2026-08-06).** `src/labels3d.js` numbers
the prism mesh's 8 corners `1,2,3,4`, unprimed on both the base and top ring — reusing exactly the
top-view/development glyph set above, not a separate letters-and-primes scheme (that convention
belongs to Module2's `vertexLabeler.js`, a different module with different pedagogy). This is what
makes Compare mode teach the correspondence rather than just show two unrelated views side by side:
a student can point at corner `1` on the 3D solid and find the same digit on the top view and on
both rows of the development. Prism only this phase, matching the numeral rollout above.

**A named scope decision, not an oversight:** the front view's own corners are NOT numbered.
Depth collapses in the front view, so each of its drawn corners is a coincidence of two real solid
corners (e.g. the prism's corners 1 and 4 both land on the front view's left edge) — labelling that
coincidence correctly needs a disambiguating convention this topic doesn't otherwise use. The two
projectors already carry that correspondence visually (each runs the full depth of its x-column,
touching every top-view corner that shares that x), which is why the top view's corners — genuinely
unambiguous, since only height collapses there — get the numerals instead.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
