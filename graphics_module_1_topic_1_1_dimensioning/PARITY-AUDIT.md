# Implementation Parity Audit

**Reference (gold standard):** `../graphics_module_1_topic_1_foundations`
**Candidate:** `graphics_module_1_topic_1_1_dimensioning`

**Audit date:** 2026-07-27
**Scope:** implementation parity only — not a code review, not a curriculum audit, not a feature
comparison. Foundations is treated as the benchmark because it has been reviewed by Engineering
Graphics faculty, internal testers and project reviewers.

**Method:** both topics read end to end; shared modules diffed byte-for-byte; CSS custom-property
sets, element-id inventories, selector inventories, ARIA attribute counts and media queries
compared programmatically; both topics screenshotted at boot at 1600 × 950.

> **Verdict as first audited: PARITY MET, with two regressions outstanding.**
> Architecture, UI language, motion and accessibility were already at or above the benchmark.
> The two regressions both originated in the curriculum-remediation work.
>
> **Status: ALL ITEMS CLOSED (2026-07-27).** Every recommendation below has been implemented
> except those marked as intentional differences, which are correct by design. See the
> remediation status immediately below; the body of the document is left unedited as the record.

---

## REMEDIATION STATUS — 2026-07-27

| # | Recommendation | Priority | Status | Implementation |
|---|---|---|---|---|
| 1.1 | Camera restore on navigation | High | **Implemented** | `main.js` gains `restoreView()`; `dimensionUI.goToStep()` calls `sim.restoreView()` on every Back / Next / rail jump, in the same position Foundations' stepper calls it. Glides through the existing `setView()` → `anim.js` path (reduced motion still snaps), returns zoom to the sheet's chosen scale, no-ops when already there. Orbit, scroll-zoom, pan and the viewport chips are untouched |
| 3.1 | Summary shown before completion | High | **Implemented** | `renderSummary()` gated on `isComplete(currentStep)` and moved into `sync()`, so it appears in place the moment the step completes. Hidden and cleared otherwise |
| 1.2 | In-viewport callout | Medium | **Implemented** | `dimensionLabels.setCallout()` + the `.vp-callout` component copied token-for-token from Foundations. Wired to Step 1's element focus and Step 5's symbol selection; cleared by `enterStep`, `showStudy` and any deselection. Excluded from the focus/fade set — a callout names the subject, it is not one of the strokes being compared |
| 1.3 | Copy heading discipline | Medium | **Implemented** | All six steps now use Foundations' triad — **What it is** / **Why we use it** / **How it is drawn** — with any instruction sentence left unlabelled, as Foundations does. Content re-split and re-labelled, not rewritten. The shape is documented on the `STEPS` JSDoc |
| 3.3 | Prose describing hidden controls | Medium | **Implemented** | New `renderCopy()` + `controlsVisible(i)`; Step 1's `postBody` is withheld until "Add the dimensions" discloses the controls it describes, and repainted at that moment |
| 1.4 | Focus hand-off helper | Low | **Implemented** | `refocus(preferred)` extracted verbatim from Foundations' stepper and used at the one site that previously inlined it |
| 3.4 | Wizard module size | Low | **Not applicable** | The audit's own recommendation was to leave it and note it. Noted in `CLAUDE.md`; splitting mid-topic would be the architectural drift the brief forbids |
| §4 | All intentional differences | — | **Not applicable** | Correct by design (ADR-133, ADR-134). Untouched |

Verification after the changes: camera restored on Next and on a rail jump while a real CDP
drag still orbits freely; summary hidden at boot and on entering an incomplete step, revealed in
place on completion; callout tracks hover / pin / unpin / symbol selection and clears on each;
**zero console errors, zero warnings** across the full six-step regression walk; CSS2D nodes
0 → 0 across 50 `simAPI.reset()` calls.

---

## Contents

1. [Features Dimensioning is missing compared with Foundations](#1-features-dimensioning-is-missing-compared-with-foundations)
2. [Where Dimensioning improves on Foundations](#2-where-dimensioning-improves-on-foundations)
3. [Regressions that should be fixed](#3-regressions-that-should-be-fixed)
4. [Intentional differences — leave alone](#4-intentional-differences--leave-alone)
5. [Verified identical](#verified-identical)
6. [Phase notes](#phase-notes)

---

## 1. Features Dimensioning is missing compared with Foundations

| Category | Foundations | Dimensioning | Impact | Recommendation | Priority |
|---|---|---|---|---|---|
| Camera restore on navigation | `stepper.goToStep()` calls `sim.restoreView?.()` on every Back / Next / rail jump | `enterStep()` never touches the camera | Orbit into the 3-D view in any step and every later step renders skewed. Worse here than in Foundations: Foundations' subject *is* a pictorial, Dimensioning's subject is a flat elevation, and Steps 3–6 (text orientation, arrangements, the review sheet) are unreadable off-axis | Add a `restoreView()` to the controller — if `poseName !== 'front'`, tween back to the front pose on step change. Keep the chip un-latching on orbit exactly as it is | **High** |
| In-viewport layer callout | `.vp-callout` pill floats on the part naming the live layer — "Type A — visible", "Type G — centre line" — driven by `labelLayer.setCallout()` | No equivalent. The line-type legend is card-side only | The learner has to look away from the drawing to know what they are looking at. Foundations keeps the name on the artefact itself | Add a callout pill for Step 1's line-type focus and Step 5's active symbol. `dimensionLabels.js` already owns the CSS2D layer — this is one more descriptor kind | **Medium** |
| Copy heading discipline | Every step uses the same triad: **What it is** / **Why we use it** / **How it is drawn** | Headings vary per step: "The idea", "Watch it happen", "Try it yourself", "Then read the sheet as a whole" | Six steps with six shapes is more to parse than six steps with one. The triad is the faculty-reviewed pattern | Normalise `STEPS[].body` onto the triad, or onto one deliberate variant of it | **Medium** |
| Focus hand-off helper | `refocus(preferred)` — after a control hides itself, focus moves to the named next control and never falls to `<body>` | No named helper | Functionally covered today (`btn-add-dims` focuses the first chip; `goToStep` focuses the title) but not guaranteed for controls added later | Extract the same two-line helper into `dimensionUI.js` | **Low** |

---

## 2. Where Dimensioning improves on Foundations

| Category | Foundations | Dimensioning | Impact |
|---|---|---|---|
| Gate feedback | Next is silently disabled | `#step-gate` names what is outstanding ("Inspect 3 more elements to continue"), wired through `aria-describedby` | Removes a dead end — the learner is never left guessing why Next is greyed |
| Step summaries | None | A summary card per step | Retention. **But see regression #1 — it is currently shown too early** |
| ARIA density | 6 × `aria-pressed`, 7 × `aria-label`, 4 × `role="status"` | 16 / 25 / 17 | Every control announces its own state |
| Keyboard interaction | Buttons only | Arrow-key nudge on the draggable value; review markers are real `<button>`s | Pointer-free parity on the topic's two hardest interactions |
| Validation feedback | No interaction requires it | `validatePlacement()` returns a rule reference plus an explanation, and the value animates back to its legal position | A reusable pattern worth porting back to the platform |
| Doc hygiene | Ships a local `DESIGN.md`, which RULES.md §1.14 / ADR-028 forbid | No local `DESIGN.md`; consumes the root copies | Dimensioning is compliant; Foundations is not |
| Hover-gated styling | 1 × `@media (hover: hover)` block | 5 | Fewer sticky hover states on touch devices |

---

## 3. Regressions that should be fixed

| Category | Foundations | Dimensioning | Impact | Recommendation | Priority |
|---|---|---|---|---|---|
| **Summary card timing** | No summary — nothing to spoil | `renderSummary()` runs unconditionally inside `goToStep()`, so **the summary is on screen at boot**, before the learner has touched a control | Every conclusion the step exists to produce is printed above the fold before they start. Visible in the boot screenshot: *"Step 1 — the elements · A dimension is five things…"* sitting under an untouched "Add the dimensions" button. This is worse than having no summary at all | Render the summary only when `isComplete(currentStep)`; call `renderSummary()` from `sync()` so it appears the moment the step completes rather than only on navigation | **High** |
| **No camera restore on navigation** | `sim.restoreView?.()` on every navigation | Absent | See §1, row 1 | As §1 | **High** |
| Prose describing hidden controls | Controls are static in the panel, so they are always visible when the prose describes them | Step 1's `postBody` — *"the elements name the parts; the line types show which weight each part is drawn at; the termination controls settle how a dimension line ends…"* — renders while `#element-group` is still `hidden` | The learner reads a description of four control groups that do not exist yet | Move that paragraph inside `#element-group`, or reveal it together with the group | **Medium** |
| Wizard module size | `stepper.js`, 353 lines; per-step controls are static in `index.html` | `dimensionUI.js`, 1032 lines; paints every control from the data catalogues | Not an architecture breach — the layering rules are obeyed and the volume is real content — but it is the one file where a future edit is likeliest to go wrong | Leave as is; do **not** split it mid-topic. Note the size in the topic's `CLAUDE.md` | **Low** |

---

## 4. Intentional differences — leave alone

Marked **EXPECTED**. These exist because the two topics teach different things, and each is
already recorded in an ADR.

| Category | Foundations | Dimensioning | Why it is correct |
|---|---|---|---|
| Cameras | Perspective + orthographic, `projectionMorphK` blend, smooth hand-back on drag / scroll / pan | One `OrthographicCamera` | **ADR-133** — a dimension only measures truly under parallel projection. RULES.md §5.18's morph governs a hand-off between two cameras that does not exist here |
| Edge classification | `meshAnalyzer.js` + a per-edge occlusion raycaster + `three-mesh-bvh`, re-run on every orbit | None. Linework is authored from the outline the solid is extruded from, and the one genuinely hidden outline is designed into the part | **ADR-133**. Foundations' raycaster is load-bearing for *its* lesson (ADR-029 Phase-3 reversal note); nothing here is camera-dependent |
| Arrowhead proportions | Platform default 3:1 (RULES.md §6.19) | Textbook Figs. 4.5–4.6 / §4.5 — ≈15° included angle, 3–4 mm, drawn thick | **ADR-134** — this topic *teaches* the proportion, and 3:1 sits outside the band the figure prints |
| Viewport chips | `Turn 90°` plus an `Inspect arrowhead` micro-zoom | `Front view` / `3-D view` / `Turn over` | Both are named poses on the same `.vp-chip` component. The micro-zoom has no subject here |
| Pure-data leaves | 1 (`foundationSteps.js`) | 6 catalogues | **ADR-133** / RULES.md §3.6a — content volume, not an architectural difference |
| Design tokens | Base set | Base set **plus** `--color-flag-wrong`, `--color-flag-right`, `--color-flag-wrong-soft` | RULES.md §4.16 additions, documented, and never used alone — a faulted dimension always also carries a ✗ marker and a written rule (Two-Cue Rule) |
| Step 1 gating | Always complete — the block is present and orbitable from the start | Gated on adding the dimensions and inspecting four elements | The undimensioned plate *is* the lesson's opening argument |
| Extra viewport furniture | — | `.vp-split` (before/after captions), `.vp-caption` (§4.5 item 6 caption band) | Subject-specific |
| Wizard module split | `stepper.js` separate from `main.js` | Wizard merged into `dimensionUI.js` | Foundations' per-step controls are three static buttons; Dimensioning's are painted from six catalogues. Same layering rules obeyed either way |
| `index.html` size | 1162 lines | 1446 | Extra step panels and four new components. The token block and the shared chrome are identical |

---

## Verified identical

Checked programmatically, not by eye:

- **`anim.js`** — md5 `c5779a0c65585a6e2ae6bd1bf9365a05` on both. RULES.md §7.1 satisfied.
- **`terms.js`** — differs in exactly three comment lines (module-name retargeting); behaviour is
  byte-for-byte identical.
- **CSS custom properties** — **zero** Foundations tokens missing from Dimensioning. The only
  delta is the three documented additions above.
- **Shared chrome element ids** — all present in both: `sim-fallback` (+ `-title`, `-body`,
  `-reload`), `sim-toast`, `sim-context-lost`, `sim-status`, `mobile-notice`
  (+ `-dismiss`), `term-pop`, `reset-confirm` (+ `btn-reset-yes` / `-cancel`), `reset-control`,
  `wizard`, `wizard-toggle`, `step-rail`, `step-card`, `step-title`, `step-lead`, `step-body`,
  `step-post-body`, `step-current`, `step-total`, `btn-back`, `btn-next`, `btn-reset`.
- **Shared components** — `.btn--primary` / `.btn--secondary`, `.rail__item` / `.rail__marker` /
  `.rail__label` / `.rail__btn`, `.seg__btn`, `.chip`, `.opt`, `.detail`, `.step-hint`,
  `.done-badge`, `.term`, the focus-visible ring, `.sr-only`, `.wizard-toggle__icon`.
- **Hit targets** — 44 px via a `::before` expansion on both `.vp-chip` and `.vp-hotspot`.
- **Media queries** — `@media (max-width: 767px)` and `@media (prefers-reduced-motion: reduce)`
  present in both.
- **Reduced motion** — handled centrally inside `anim.js` (tweens jump to their end value and
  `ease` is never called). Foundations' six extra `prefersReducedMotion` call sites are all
  projection-morph branches, which do not exist here.
- **Line endings** — CRLF throughout both topics.
- **Lifecycle** — both self-start, both expose `window.simAPI = { pause, resume, reset }`, both
  route Reset through the single `simAPI.reset()` path (RULES.md §2.9), both use one `rebuild()`
  for geometry with a full deep-traversal disposal contract, both handle
  `webglcontextlost` / `webglcontextrestored`, both use `ResizeObserver` and keep
  `LineMaterial.resolution` in sync.

---

## Phase notes

### Phase 1 — Architecture

Near-identical. Both are the ADR-007 standalone orchestrator: a thin `main.js` owning the scene,
the single `rebuild()` and the disposal contract, with pure leaf modules in a star that never
import one another. Both pin `three@0.160.0` through an import map with no build step. Both keep
all CSS in the `index.html` shell.

Meaningful differences: the wizard-module split, the number of pure-data leaves, the camera and
edge-classification stacks, and Foundations' stray local `DESIGN.md`. All are covered above.

### Phase 2 — Guided stepper

Both: a rail with ✓ / number markers (a shape cue, not colour alone), one-way-back rail jumping
guarded by completion, a disabled Next, `aria-current="step"`, focus moved to the step heading on
change, the scroll region reset to the top, the `panelIn` animation re-triggered per step, reset
through the single engine path, and `AbortController` disposal.

Dimensioning adds the gate hint and the summaries; it is missing the navigation camera restore.

### Phase 3 — Interaction

Dimensioning is the richer of the two: pointer-and-keyboard value placement with live validation,
three sliders, hover-to-isolate chips, variant chips, keyboard-playable hotspots, a two-sheet
compare, and scale/unit controls. Foundations has the micro-zoom with restore, the `Turn 90°`
guided nudge, and an X-ray toggle that deliberately persists across steps.

The only interaction-quality gap is the missing camera restore.

### Phase 4 — Educational patterns

Both introduce → explain → demonstrate → let the learner act. Foundations reinforces through a
rigid copy triad; Dimensioning reinforces through summary cards, which is a stronger device
**provided they are not shown up front** (regression #1).

### Phase 5 — UI consistency

No drift found. Same cards, rail, chips, buttons, segmented controls, detail panels, spacing
scale, type scale, iconography, motion tokens, viewport chrome, hint pill, wizard toggle and
two-state Reset confirm. Confirmed by side-by-side boot screenshots as well as by token and
selector inventories.

### Phase 6 — Animation

`anim.js` is byte-identical, so easing curves, the tween engine and reduced-motion behaviour are
the same by construction. Dimensioning's `TIMING` table plays the role Foundations' `QUICK_VIEW_MS`
constants play. Reveal choreography is subject-specific but uses the same engine. Parity.

### Phase 7 — Accessibility

Dimensioning is at or above the benchmark on every axis measured: ARIA density, keyboard reach,
live-region narration, focus management, 44 px targets, contrast tokens and motion reduction. The
only note is the missing named `refocus()` helper, which is currently covered by hand.

### Phase 8 — Implementation features worth porting

1. Camera restore on step navigation (**High**)
2. In-viewport callout naming the live layer (**Medium**)
3. The copy triad (**Medium**)
4. The `refocus()` helper (**Low**)

### Phase 9 — Regressions

Listed in §3. Two are High and both come from this session's curriculum work; neither is
architectural.

### Phase 10 — Intentional differences

Listed in §4, all ADR-backed.

---

*Parity audit · Foundations as benchmark · implementation only, not curriculum (see
`CURRICULUM-AUDIT.md` for that) · 2026-07-27.*
