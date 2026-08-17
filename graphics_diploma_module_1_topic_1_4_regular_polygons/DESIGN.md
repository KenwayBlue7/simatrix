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

**Hover (2026-08-11).** An unpressed button shifts to `--color-panel` fill / `--color-ink` text
under the standard `(hover:hover) and (pointer:fine)` gate (root DESIGN.md §5.10) — fill only,
not border, since `:not(:first-child)` zeroes `border-left` and a border-colour hover would
darken three sides while leaving the shared seam untouched. The pressed button is excluded
(`:not([aria-pressed="true"])`) because its own click handler already no-ops on itself — a
hover cue there would promise an action that never happens. `.construction-picker__item` (Step
1) got the matching treatment (`--color-panel` fill, `--color-bench-grey` border) for the same
reason, using the same exclusion.

## 4. Step Through (new, N-Gon construction only)

`#step-through` sits where `#btn-play-construction` sits for pentagon/hexagon — same Construct-
step slot, toggled by `hidden` on whichever the active construction needs (`uiManager.js`'s
`sim.hasSlides()` branch), never both at once. Layout only, no new colour tokens: reuses `.btn`/
`.btn--primary` verbatim (RULES §4.1); `.btn--block` stays only on Play All now, since Back/Next
share a row instead of stacking full-width. `.step-through__caption` (2026-08-10) is an
accent-soft hint callout — `--color-accent-soft` bg, `color-mix(in srgb, var(--color-accent) 25%,
var(--color-border))` border, `--color-ink` text — reusing `#result-warning`'s recipe
byte-for-byte (root DESIGN.md §5.8 Hint callout — full accent wash, never a side-stripe border —
and §2.1's token table, which licenses `accent-soft` for "hint callouts"). Promoted
from the earlier plain `--color-paper`/`--color-border`/`#result-text` treatment because the
caption dropped its `Slide X of Y —` prefix (now instruction-only) and needed to read as the
widget's primary content, not a quiet status line. Weight stays 400 at `--text-sm` — no 500/600
exists (Two-Weight Rule) — so the wash and full ink alone carry the lift. Slide position moved
out of the sentence into `.step-through__count`, a small `aria-hidden` `--font-mono`
tabular-nums chip (`n / total`) on the same row: `aria-hidden` because `#sim-status` already
speaks "Slide N of Total" in prose on every Next/Back (`uiManager.js`'s `sim.announce()`), so the
chip would double the announcement, not add to it; the caption `<p>` keeps its own
`aria-live="polite"` since `play()`/`resetStepThrough()` update it without going through
`announce()`.

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

## 6. Step note — concept blurb for Given/Construct (new, ADR-154)

`#step-note` sits between `#step-lead` and the four `.step-panel`s, so it renders once per phase
change regardless of which panel is showing — it is not inside any one panel. Filled from
`constructions.js`'s new `notes.given`/`notes.construct` (`stepper.js`'s `renderNote()`), hidden on
Choose and Verify (each already has its own concept copy — the Step-1 term prose, and Verify's own
`principle()`/"Why it works" block).

**Deliberately NOT a second accent-soft box.** `.step-through__caption` (§4, above) already owns
the accent-soft hint-callout treatment in the Construct panel, promoted there specifically so it
reads as that widget's primary content. `#step-note` reuses Verify's own
`.result-block__eyebrow` + `.result-principle` recipe instead — mono-uppercase eyebrow ("The
idea"), `--text-sm`/`--color-ink-secondary` body, no border, no fill. Sitting above the method
switcher and caption in visual order, at lower visual weight, it reads as the quiet context the
accent-washed instruction sits on top of, not a second thing competing for the same attention.
Zero new tokens (RULES §4.1/§4.16) — both classes already existed in this file for Verify.

Content is method-aware in Construct (`notes.construct(method)`) — same `(method) => string` shape
`principle()` already uses — because the visible derivation changes with the method switcher;
`notes.given` takes no method argument, since the given value doesn't depend on which method is
later chosen. Every string ends `(K.C. John Ch. 5)` — chapter-level, not figure- or method-level,
because an audit found the sim's Pentagon "Two Circles + Arc"/"Three Arcs" methods do not
literally match K.C. John's own Method-II/Method-III constructions (see ADR-154 for the full
per-method mapping) — only chapter attribution is true for all seven methods across the three
constructions.

`#step-note-body` carries its own `aria-live="polite"`, independent of `goToStep()`'s phase-change
announcement — the same split `.step-through__caption` uses (§4) — so a method switch announces the
new blurb once, without doubling the phase announcement.

---

## 7. Default view — content-fitted, capped (new, ADR-155)

The Construct-view drawing now opens (and re-fits as `side`/`n` sliders move) framed on the active
construction's own drawn bounds, capped at **1.6×** zoom, instead of the fixed `200×200` viewBox
at zoom 1.0 every other SVG topic in this track still opens on. Fixes a reported defect: the fixed
default under-filled every config below `calibratedScale()`'s worst-case calibration (§2's scale
mechanism), worst on the N-Gon at small `side`/small `n` (~45% of the frame at the default 32mm/
n=6, down to ~30% at the smallest config).

**The cap is load-bearing, not cosmetic.** An uncapped fit (the `development_of_surfaces` module-2
precedent this borrows from) would render n=3 and n=12 at near-identical on-screen size, erasing
`calibratedScale()`'s own "the drawing visibly grows with side/n" point (ADR-145 §2). 1.6× was
picked by measuring: the N-Gon default fills ~76% of the **200×200 viewBox** at that cap, and the
smallest N-Gon config still reads visibly smaller (~63%) than the largest (~92%) — size stays
monotonic in both `side` and `n` at every cap tested. Do not remove the cap, and do not raise it
past ~1.8× without re-measuring the same monotonicity check (`constructions.js`'s `CONSTRUCTIONS`
export makes this a five-minute node script, not a manual eyeball).

**Fill of the viewBox is not fill of the viewport (Phase A verify, 2026-08-11).** The percentages
above describe the square `200×200` viewBox, not the rendered `#sim-viewport` — `preserveAspectRatio
="xMidYMid meet"` letterboxes that square into whatever aspect the wizard layout leaves (measured
0.75–1.5 across wizard open/collapsed states, never the ~2:1 a naive "wide desktop" read would
assume), so the true on-screen fill is lower on whichever axis gutters — e.g. ~57% vertically at
the N-Gon default with the wizard panel open, vs. the ~76% viewBox figure above. `fitToBounds()`,
`clampPan()`, and `ensureVisible()` all reason in viewBox space, and `meet` scales both axes by
the same factor, so the cap's monotonicity argument is unaffected — this only changes what the
percentages above are percentages *of*.

**A manual view is left alone.** Any wheel-zoom, drag-pan, pinch, or arrow-key move
(`viewTransform.js`'s `userAdjusted` flag) suppresses the slider-driven re-fit until the student
explicitly resets — dblclick, the `0` key, or the wizard's Reset — the same "don't fight a
comfortable manual zoom" rule `ensureVisible()` already applied at Play time (§ this file's root,
`../DESIGN.md`'s pan/zoom section). Do not clear `userAdjusted` from inside `fitToBounds()` itself;
only an explicit reset path should count as "fresh".

---

## 8. Playback pacing and the skip control (new, ADR-159)

Phase A audit findings E5/E15: `durationFor()` (`renderConstruction.js`) has no ceiling on a
whole `playSteps()` call. Measured against the real geometry, every construction's own default
already ran 22–37s of unskippable animation; N-Gon/Semicircle Division at `n=12` ran **75.6s**,
and neither `#btn-play-construction` nor `#btn-play-all` ever changed state to say so or offer a
way out.

**The fix is a whole-call time budget, not a per-step duration change.** `playSteps()` sums
`durationFor()` across whatever step list it was handed; if the total exceeds
`PLAY_BUDGET_MS` (20s), every step in that call is scaled down by the same factor, so an arc
still visibly takes longer than a point — the *relative* pacing `durationFor()` encodes survives
compression, only the absolute scale changes. The budget applies to **every** `playSteps()` call
identically — Play/Play All's whole-recipe call and Step Through's one-slide call are not
special-cased against each other.

**What that means for each caller in practice:**
- **Play / Play All** hand `playSteps()` the entire `resolvedMoveResult` — this is the call that
  visibly compresses. N-Gon/Semicircle Division `n=12`: 75.6s → ~21.0s. Every construction's
  default now plays in ≤ 20s (previously 22–37s).
- **Step Through** hands `playSteps()` one slide's slice at a time. The overwhelming majority of
  slides are already well under 20s, so they render at `durationFor()`'s literal per-kind pace,
  unchanged. **Two slides, both only at the N-Gon slider's `n≥11` ceiling, are the exception**:
  Semicircle Division's final "Join every side" slide and Perpendicular Bisector's "cut every
  vertex" slide (which groups all of a large-`n` polygon's cut-arcs into one `mark()` call) both
  exceed 20s on their own and get the same mild compression Play All gets (7–17%, imperceptible
  as a stopwatch difference). This is read as correct, not a gap: the budget's actual promise is
  "no single reveal ever runs unbounded," which now holds for every slide as well as every full
  Play, not just the common case. Verified numerically for every `(method, n)` pair the n-gon
  slider allows (3–12), not eyeballed at `n=12` alone.

**The skip control reuses `showStepsUpTo()`, it does not add a second "jump to finished" path.**
While a `playSteps()` call is in flight, `#btn-play-construction` (Pentagon/Hexagon) and
`#btn-play-all` (N-Gon) relabel from their idle text to **"Skip to end"**. Clicking that calls
`simController.skipToEnd()` — a one-line wrapper over the existing `showStepsUpTo(fullLength)`,
which already cancels the active tween and renders the rest statically. No new render path, no
new markup, no new CSS, no new colour token: both buttons keep their existing `.btn`/`.btn--block`
classes and only their `textContent` changes.

**Step Through's own display is kept truthful while Play All runs**, correcting E15's Play-All
half: `uiManager.js` previously set `stepIdx = slideCount() - 1` the instant Play All was
*clicked*, so the caption jumped to the final slide's text and Next disabled while slide one was
still drawing. `stepIdx` is now only written once the call actually **completes** (`sim.play()`'s
`onComplete`); while it is running, the caption reads "Playing all steps…" and Back/Next are both
disabled instead of silently lying about progress.

**E15's Step-Through-Next half was reviewed and is not a defect.** `goStepNext()`'s caption and
`sim.announce()` describe the slide currently drawing — that is what a student watching it wants
to read, and deferring the announcement to completion would leave a screen-reader user silent for
the slide's own draw time. Only Play All's synchronous state jump, above, was the actual lie.

---

## 9. Construct-step spacing rhythm (new, ADR-160)

Phase A audit findings U8–U12: everything added to the Construct step across §§4/6/7 above landed
at the same flat `--space-3` (12px) gap and the same `--text-sm`/ink-secondary register, so five
individually-documented additions read collectively as one undifferentiated grey stack. Fixed as
one layout pass, not five patches — no new tokens (RULES §4.1/§4.16), every value below is one of
the six already in root DESIGN.md §4.1.

**Three-tier spacing, replacing the flat `--space-3` everywhere in `.construct-actions` and
`.step-through`:**
- **`--space-2` (8px, tightest)** — pairs that are really one control: Back/Next (unchanged), and
  now the Step Through caption to the Back/Next row beneath it (was `--space-3`) — the row reads
  as *belonging to* the caption above it, not a separate block at arm's length.
- **`--space-3` (12px, medium)** — an alternate action within the same widget: Play All under the
  Back/Next row (was flush at the same gap as the caption-to-row pair above it). Play All is the
  same *widget* as Step Through, just its other reveal mode — U11 — so it gets more air than the
  tightest tier but less than a genuinely separate control.
- **`--space-4` (16px, loosest)** — between actually distinct widgets: `.construct-actions`'
  own gap (method switcher ↔ the reveal control ↔ the replay hint), was `--space-3`, the same as
  the tightest tier inside the widget one level down (U10 — nothing was grouping).

Net vertical cost: `.step-through`'s own stack goes 24px→20px (tighter), `.construct-actions`'
goes 24px→32px (looser); +4px total on the Construct-step stack, not expected to move the U4
overflow-risk finding meaningfully (unverified, out of scope here).

**`.construct-actions { align-items: center }` deleted** (U9). It was the only rule touching
`#construct-replay-hint` — every other child is already `width: 100%` by its own rule, so
`center` had exactly one effect: shrinking the hint to content width and centring the one line
that should read as left-aligned card prose, right down to making its own `.card__lead`
`max-width: 60ch` a dead rule (nothing to cap on a one-line centred string). Default `stretch`
fixes both at once.

**`#step-lead` promoted to `--text-base`/`--color-ink`** (U8), overriding its inherited
`.card__lead` on this one id only — `.card__lead` itself is untouched, still the shared "quiet
supporting prose" recipe used unchanged by Step 1's own body copy and the replay hint above.
`#step-note-body` was deliberately kept at `--text-sm`/ink-secondary (§6's own stated intent —
"quiet context"), so the fix promotes the line that was actually missing a distinct register
rather than demoting the one that already had the right one; the pairing now reads instruction
(what to do) → context (why it works) instead of two identical greys.

**`.step-through__caption` gets an `.is-idle` state** (U12), toggled by `renderStepThrough()`
alongside its existing text/disabled-state writes. At rest (`stepIdx < 0`, nothing revealed yet)
the box drops the accent-soft wash for the same quiet-chrome palette as everything else at rest —
its resting copy ("Press Step Through to begin.") was restating `#btn-step-next`'s own label 40px
below, so the promoted accent-soft treatment (§4, "needs to read as the widget's primary
content") was being spent on content that wasn't primary. The wash returns the moment a real
slide caption lands (`stepIdx >= 0`) or Play All is running ("Playing all steps…") — both cases
where the box is carrying content nothing else on screen says. Copy itself is unchanged; this is
a visual-weight fix, not a rewrite.

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
