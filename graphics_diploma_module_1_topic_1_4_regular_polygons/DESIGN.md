# DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md`. On any conflict the **root file wins** (RULES.md §4.16). This file
> records only what is unique to this topic. It is copied from Topic 1.1's own appendix — the
> construction-line token map (§2) is byte-identical and reused unchanged; §3 (the method
> switcher) is new; §4 (Step Through) is new.

---

## 1. Subject

A flat 2D construction sheet (SVG), not a 3D scene — there is no camera, no orbit, no HP/VP/PP
planes. The root DESIGN.md's projection-plane encodings (`--color-hp-line` / `--color-vp-line` /
`--color-pp-line`) **do not apply here** and are not referenced by this topic's code.

## 2. Construction-line token map (reused from Topic 1.1/1.2/1.3, unchanged)

A construction has three roles a line/point/circle can play, and each needs its own colour
**plus** a second cue (Two-Cue Rule, root DESIGN.md §2.3) so meaning never rests on hue alone.

| Role | Token | Value | Weight / style | Second cue |
|---|---|---|---|---|
| **Given** — the starting side AB, stated by the problem | `--color-construct-given` | `#5a5d66` (= `--color-ink-secondary`, reused — no new hue needed) | solid, standard weight | labelled endpoints (A, B) |
| **Construction move** — a compass arc, auxiliary circle, or ray drawn *during* the build | `--color-construct-move` | `#7b4fb5` (violet — Module 1's `--locus` role, DESIGN.md §2.2, reused for consistency) | thin, **dashed** | the auxiliary circle/arcs and the circumcentre O are drawn distinctly from the given side |
| **Result** — the finished polygon's sides and vertices | `--color-construct-result` | `#1f8a4c` (green — Module 1's `--tl-green` role, DESIGN.md §2.2, reused for "the answer") | solid, **bold weight** | each vertex gets a filled dot + letter label (A, B, C…) |

Declared as real CSS custom properties in `index.html`'s `:root` (so `getComputedStyle` reads
them at runtime, RULES §4.2 — never a hard-coded hex in `renderConstruction.js`):

```css
--color-construct-given:  #5a5d66;
--color-construct-move:   #7b4fb5;
--color-construct-result: #1f8a4c;
```

Every other visual rule in root DESIGN.md — Quiet Chrome, Chrome-Only Blue, Flat-Ink,
Border-Over-Shadow, the Tabular Rule for every mm/°/count readout — applies unchanged.

## 3. The method switcher (new to this topic)

`#method-switcher` is a segmented button group, visually identical in spirit to Topic 1.2's
`#mode-toggle` (same active-state fill, same border treatment) but a real generalization, not a
copy: Topic 1.2's toggle was a fixed 2-button binary (`external`/`internal`) shown for exactly
one of four constructions. This topic's switcher shows for **every** construction, and its
button **count varies** — pentagon offers 3 methods, hexagon and the general n-gon offer 2 each.
CSS reflects that: `flex: 1 1 0` on `.method-switcher__btn` (not a hardcoded `flex: 1 1 50%`)
divides the row evenly whatever the count, and `uiManager.js` builds the buttons from
`constructions.js`'s `methods` array at render time rather than hardcoding them in markup — the
same "data drives the DOM" approach `renderGivenFields()` already uses for the given-value
sliders, just applied to a segmented control instead of a slider bank.

Placement: inside the Construct step (step 3), above the Play button — the student picks a
method, then presses Play to watch THAT method's derivation animate, exactly mirroring Topic
1.2's toggle placement. Selected state reuses `--color-accent` fill, same as `.btn--primary` and
`.rail__item.is-current` — no new colour token, consistent with RULES §4.16.

## 4. Step Through (new, N-Gon construction only)

`#step-through` sits where `#btn-play-construction` sits for pentagon/hexagon — same Construct-
step slot, toggled by `hidden` on whichever the active construction needs (`uiManager.js`'s
`sim.hasSlides()` branch), never both at once. Layout only, no new colour tokens: reuses `.btn`/
`.btn--primary` verbatim (RULES §4.1); `.btn--block` stays only on Play All now, since Back/Next
share a row instead of stacking full-width. `.step-through__caption` is a plain bordered text
block at `--text-sm` — same `--color-paper`/`--color-border`/`--radius-sm` treatment `#result-text`
already uses, so a slide's caption reads as "a value the sim is reporting", not a button or a
label.

The primary button relabels by state instead of a separate "start" trigger — "Step Through" at
rest (nothing revealed yet), "Next" once a slide is showing, disabled at the final slide. The
caption sits on its own full-width row above the controls; **Back sits immediately to Next's
left in the row below**, matching every other Back/Next pair in this repo (Module2's
`.method-bar`, Topic 6's `.con-nav`, and this topic's own footer `.card__nav-next`) rather than
the earlier layout, which split Back onto the caption's row by analogy to `#btn-reset`/
`#reset-confirm` — a confirm prompt, not a navigation pair, and a weaker precedent than the three
above. `.step-through__back` no longer overrides `.btn`'s `min-height: 44px` (it previously sat
at 40px, under RULES §4.12's interactive-target floor); Next gets `flex: 1 1 auto` so it fills
the row while Back stays content-width. No new focus-ring, press, or disabled treatment — `.btn`'s
existing states cover all of it.

## 5. Post-construction de-emphasis + label layering (new, ADR-145)

Once a construction finishes drawing (Play completing, or Step Through's last slide), every
`move`-role element fades to 32% opacity — `#dynamic-layer.is-complete [data-role="move"]` in
`index.html`, toggled by `main.js`'s `setComplete()`. The finished `result` polygon (and every
`given` element) stays at full opacity throughout: the fade is what lets the answer read as *the*
answer once the derivation is done, not one more line among equals. Reduced-motion collapses this
to instant, for free, via the file's existing blanket `transition-duration: 0.001ms !important`
rule (§4.13) — no separate branch needed.

Every step's text label lives in a `[data-layer="labels"]` sub-`<g>`, always painted after (on top
of) that same layer's `[data-layer="ink"]` sibling (`renderConstruction.js`'s `ensureSublayers()`)
— a later step's line/arc/circle can never paint over an earlier label. Do not reintroduce a
single flat group mixing ink and text per step. The original fix also added a paper-coloured
`stroke` halo behind each label (`paint-order: stroke`); that halo was removed once labels became
proportionally sized via `chromeScale` (a later session) — with chrome density around a label now
scaled down with the geometry, the halo stopped earning its keep and read as clutter. The
sublayer-ordering half of this fix stands; the halo does not.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
