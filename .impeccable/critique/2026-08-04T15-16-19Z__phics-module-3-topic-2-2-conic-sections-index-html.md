---
target: graphics_module_3_topic_2_2_conic_sections
total_score: 30
p0_count: 0
p1_count: 3
timestamp: 2026-08-04T15-16-19Z
slug: phics-module-3-topic-2-2-conic-sections-index-html
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Strong: step rail, live numeric readouts, stage counters. But the floating flow-note goes stale, telling you at Step 3 to "tick Cut the cone" when the cone is already cut. |
| 2 | Match System / Real World | 4 | Genuinely excellent. Drafting conventions are respected (chain centre lines, crimson cut face, BIS dash vocabulary), and jargon is always introduced before it is used. |
| 3 | User Control and Freedom | 3 | Back/Next everywhere, two-state Reset guard, minimize/restore. No undo for a mis-set slider, and no way to skip the Step 4 proof to its end. |
| 4 | Consistency and Standards | 2 | Step 4 shows two visually identical primary "Next" buttons 200px apart doing completely different things. Step 6 stacks two full-width primary buttons. |
| 5 | Error Prevention | 3 | Step 6 correctly disables the answer chips until a cut is dealt; Reset is two-state. Nothing prevents pressing the wrong "Next" in Step 4. |
| 6 | Recognition Rather Than Recall | 4 | Hover-any-element-to-explain on both panes, labelled 3D features, term definitions inline. This is the strongest part of the product. |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts for the construction stepper or step navigation. Playback runs at a fixed 2.2s dwell with no speed control. Pause exists; scrub does not. |
| 8 | Aesthetic and Minimalist Design | 2 | The floating drawing sheet sits on top of the cone in Steps 4 and 6, occluding the exact object the copy tells you to watch. Up to four instructional messages compete at once. |
| 9 | Error Recovery | 3 | Answers give the right verdict with the rule restated. No error states elsewhere to recover from; also nothing that can break. |
| 10 | Help and Documentation | 4 | Contextual throughout: onboarding chips, per-step hints, hover explanations, the methodology card, the problem library. Nothing is behind a manual. |
| **Total** | | **30/40** | **Good — solid foundation, weak areas are concentrated and fixable** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** This is the rare case where the answer is clearly negative. The palette is a committed clinical grey-and-white with domain colours that carry documented reasoning (crimson for cut material is a drafting convention, not a mood choice). The typography is two families with real jobs (Atkinson Hyperlegible for prose, IBM Plex Mono for numeric readouts). There are no cards-with-icons grids on the teaching surface, no gradient text, no glassmorphism, no hero metrics, no eyebrow-above-every-section. Radii top out at 10px. Line weights are a closed vocabulary. Someone made decisions here.

**LLM assessment**: The one place slop grammar shows is the practice-problem overlay: eleven identically-sized cards, nine of which truncate their body text with "…", so every card is a mystery box you must click to evaluate. The card titles already carry the givens ("Focus 50 mm from the directrix, e = 2/3"), which makes the truncated body pure noise.

**Deterministic scan**: CLI detector over the topic, 2 findings, both `warning`:
- `flat-type-hierarchy` at `index.html:168` — sizes 11/12/13/14/14.7/16/18px, ratio 1.6:1
- `em-dash-overuse` — 10 em dashes in body copy

In-page detector (injected at `http://localhost:8400/detect.js`), **7 findings**, so the browser pass caught five the CLI could not see:
- `clipped-overflow-container` ×3 — `section#step-card`, `div#compare-card`, and one anonymous `div`, each clipping an absolutely-positioned child
- `all-caps-body` ×2 — `p#proof-stage` (32 chars) and `summary.terms-panel__summary` (33 chars)
- `text-overflow` — `span.sr-only` overflows by 131px
- `flat-type-hierarchy` — live-computed 11/12/13/14/16/18/21.6px, ratio 2.0:1

**False positives I am dismissing:**
- `text-overflow` on `span.sr-only` is the standard visually-hidden pattern. It is supposed to sit outside its box.
- `flat-type-hierarchy` is wrong for this register. The product reference explicitly wants a 1.125–1.2 step ratio for dense UI; a 2.0:1 total span across a six-step scale is correct, not flat. The real (mild) issue is redundant neighbours: 13px and 14px are not doing distinct work, and 14.7px is a computed accident rather than a token.

**Where the detector beat me**: the three `clipped-overflow-container` hits corroborate something I had seen visually but not diagnosed. `.card__scroll` carries `overflow-x: hidden`, and `#step-card` carries `overflow: hidden`. That is what cuts "Hover any label on the cone to see what it" mid-sentence at Step 1 with no scroll affordance in view.

**Visual overlays**: injection succeeded (title mutation and script-tag append both verified before injecting), 14 overlay nodes were created in the page and the console reported `[impeccable] 7 anti-patterns found`. This ran in a headless tab, so there is **no overlay visible in a browser you can look at**; the console output above is the deliverable.

## Overall Impression

This is a serious, well-made teaching instrument that is being undermined by its own window management. The drawing and the mathematics are excellent, the vocabulary is disciplined, and the hover-to-explain layer is genuinely better than most commercial equivalents. But the floating sheet covers the cone in the two steps that most need both visible, Step 4 puts two identical blue "Next" buttons on screen doing different things, and the whole thing collapses at phone width while claiming to merely be "best experienced on desktop."

The single biggest opportunity: **stop floating panels over the subject.** Steps 4 and 6 are about relating a solid to a drawing. Right now the drawing is parked on top of the solid.

## What's Working

1. **The domain-colour discipline.** Every colour has a token, a documented reason, a measured contrast ratio, and a non-colour cue paired with it (the Two-Cue Rule). Crimson means cut material because that is what it means on a drawing board. This is the opposite of decorative palette-picking.

2. **Recognition over recall, executed thoroughly.** You can point at any line on the drawing sheet or any label on the cone and be told what it is, in a sentence, in place. The engineering-terms panel re-resolves against whatever is currently drawn. A learner never has to hold a definition in their head to read the next thing.

3. **The step rail.** Six numbered stops, completion checks, current step in accent, labels under each. It answers "where am I, how much is left, can I go back" without a word of explanation, and it survives to a horizontal strip on mobile.

## Priority Issues

### [P1] The drawing sheet occludes the cone in Steps 4 and 6

**Why it matters**: Step 4's copy says "Watch the cone. Each press shows one more step of the proof." The proof plays on the cone; the sheet card sits over the apex where the focal sphere is inscribed. Step 6 asks the learner to look at a cut and name it while the sheet floats over that cut. In both cases the interface is hiding the thing its own copy points at. The Step 5 case is worse in one specific way: the tangent method's base line is a tall vertical at the right of the drawing, so its top half and its "A" label disappear behind the panel.

**Fix**: Give the sheet its own gutter instead of floating it. Reserve a right-hand column in Steps 4 and 6 the way Step 5 reserves one, or inset the 3D camera framing so the cone is composed into the clear area. If it must float, add the card's width to the sheet layout's margin so no linework is ever authored under it.

**Suggested command**: `$impeccable layout`

### [P1] Two identical primary "Next" buttons in Step 4

**Why it matters**: `Next ›` advances one stage of a seven-stage proof. `Next` in the footer leaves Step 4 entirely. Both are `btn--primary`, same blue, same size, roughly 200px apart in the same scroll column. Pressing the wrong one abandons a proof the learner is midway through, and there is no undo beyond navigating back and re-walking it. The same failure appears in Step 6, where "Set up a cut" and "Pick a problem" are both full-width primaries: two primaries mean no primary.

**Fix**: One primary per screen. The proof stepper is the in-step action, so it keeps the accent; the footer Next becomes secondary until the proof is complete, then promotes. In Step 6, "Pick a problem" drops to secondary — it is the alternative path, not the main one.

**Suggested command**: `$impeccable polish`

### [P1] The sim is unusable at phone width, not merely degraded

**Why it matters**: The platform contract says the mobile notice is a banner and must not "block, redirect, or disable the sim." At 390×844 the drawing sheet takes ~300px, the 3D viewport is reduced to a sliver, and the step card's scroll region collapses to roughly one line of usable height. At Step 6, "Set up a cut" (the only way to start the exercise) is not reachable without scrolling inside a region too small to scroll comfortably. "Best experienced on desktop" promises degraded-but-usable; this is neither.

There is a second break band at ~700–900px: at 768px, "Practice problems" is clipped at the dock's right edge and "STEP 6 OF 6" wraps to three lines.

**Fix**: Below 768px, minimize the drawing sheet by default rather than opening it, and let the step card own the viewport height with the 3D collapsed to a fixed-aspect strip. Raise `--wizard-w`'s lower clamp or reduce the header's content at narrow widths so the "Practice problems" affordance stops truncating.

**Suggested command**: `$impeccable adapt`

### [P2] Content is clipped with no scroll affordance

**Why it matters**: The in-page detector flagged `section#step-card` and two other containers clipping positioned children, and it is visible at Step 1: the sentence "Hover any label on the cone to see what it" ends there, cut by the scroll container. Nothing indicates more text exists. `#step-card` is `overflow: hidden` and `.card__scroll` is `overflow-x: hidden` with `overflow-y: auto`, so a learner who does not think to scroll simply loses the instruction. The term-definition popover already escapes this deliberately with `position: fixed`; `#sheet-tip` is still `position: absolute` inside an `overflow: hidden` card, which is the same structural risk (I swept the Step 5 sheet and could not make it clip in that mode, so this one is a risk, not a confirmed break).

**Fix**: Add a scroll shadow or fade at the bottom edge of `.card__scroll` so cut content announces itself. Move `#sheet-tip` to `position: fixed` for consistency with the term popover.

**Suggested command**: `$impeccable audit`

### [P2] Step 6 hands over most of the answer

**Why it matters**: Step 6 asks "which curve is this?" and now draws the true shape of the cut, flat and clean, on the sheet beside it. Withholding the naming caption (which was done deliberately) stops it saying the word, but an ellipse drawn face-on is recognisably an ellipse. The flat drawing is materially easier to read than the foreshortened 3D face, so the assessment step is now supplying the aid that makes the assessment trivial. This is a direct consequence of a recent, requested change, so it may be intended: worth a decision either way.

**Fix**: Either minimize the sheet by default in Step 6 and let the learner open it as a check after answering, or keep it and accept that Step 6 is practice rather than assessment. Do not leave it undecided.

**Suggested command**: `$impeccable shape`

## Persona Red Flags

**Jordan (Confused First-Timer)** — the primary persona for a guided lesson:
- At Step 1 the instruction "Hover any label on the cone to see what it" is cut mid-sentence. Jordan reads instructions carefully and will stall on a truncated one.
- At Step 3, a note floats over the viewport saying "Aim it, then tick 'Cut the cone'." There is no "Cut the cone" checkbox on this step; it belonged to Step 2, and the cone is already cut. Jordan will hunt for a control that is not there.
- At Step 4, two blue buttons labelled "Next" are visible at once. Jordan takes labels literally and has no way to know which one is "next" in the sense they mean.
- Up to four instructional messages compete at Step 3 (top flow note, dock hint, mono readout, bottom onboarding chip). Jordan reads all of them and loses the thread.

**Sam (Accessibility-Dependent)**:
- Keyboard-only works: tabbing reaches the rail buttons, focus rings are present, every control I sampled has an accessible name, and there is a polite live region (`#sim-status`).
- Smallest interactive target measures **32px**, under the 44px touch minimum. Fine for mouse, tight for touch and for motor impairment.
- The construction playback runs on a fixed 2.2s timer with pause but no speed control and no way to step at a chosen pace during autoplay. Time-limited content without an extension option.
- Only **one** `prefers-reduced-motion` block exists in the stylesheet, but the sim's real motion is in Three.js tweens and canvas redraws, which CSS media queries do not govern. The curve trace, the camera swings and the plane tours will all still run for a user who asked for reduced motion.

**Alex (Impatient Power User)**:
- No keyboard shortcuts for step navigation or the construction stepper. Walking the oblong method by hand is 11 mouse clicks on a 32px target.
- Playback cannot be scrubbed or sped up. Alex will not sit through 12 stages at 2.2 seconds each.
- Nothing is skippable to the end state: arriving at Step 5 now deliberately shows the given data, and the only route to the finished figure is pressing Next repeatedly.

## Minor Observations

- `p#proof-stage` renders "STAGE 1 OF 7 · THE CUTTING PLANE" in uppercase, 32 characters. The house rule is uppercase for labels of four words or fewer; this is seven. Same for the terms-panel summary at 33 characters.
- 10 em dashes in learner-facing copy. The brand voice is "a warm one-on-one tutor"; em-dash cadence is the thing that most makes prose read as machine-written.
- "That crimson curve where the plane meets the cone IS the conic section" uses capitals for emphasis mid-sentence. Use italics or restructure.
- The type scale carries 13px and 14px steps that do not do distinct work, plus a computed 14.7px that is not a token. Collapse to the documented ramp.
- The practice-problem dialog leaves roughly a third of its height empty at the bottom while the title and close button hug the top corners. The composition is unbalanced.
- Every problem card truncates its body with "…" although the title already states the givens. The truncated line adds nothing.
- The onboarding chip at the bottom of the viewport persists across step changes, so at Step 4 it still says "orbit until you face it square-on" after the camera has already faced the section for you.

## Questions to Consider

- What if the drawing sheet were a reserved column in Steps 4 and 6 rather than a floating window? The window controls exist because it floats; remove the float and the whole minimize/restore/compare apparatus gets simpler.
- Is Step 6 an assessment or a practice round? The answer changes whether the sheet should be open by default.
- If a learner has to press Next twelve times to see the oblong construction, is the manual stepper the primary path and autoplay the accelerator, or the other way round? The current UI gives them equal weight.
- What would this look like if the 3D pane and the drawing pane were siblings at every step, rather than one being a window that opens over the other?
