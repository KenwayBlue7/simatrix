# Simatrix — Product

> **Single source of truth.** This is the platform-wide strategic product contract for **all
> Simatrix simulations** (Engineering Graphics, Mechanical, Civil, Electrical & Electronics,
> Computer Science). It lives at the Simatrix root; **each module references this file rather
> than duplicating it** (`Module1/CLAUDE.md` and `Module2/CLAUDE.md` point here via
> `../PRODUCT.md`). It was centralized from the two former byte-identical per-module copies on
> 2026-06-28 (DECISIONS.md **ADR-023**), the same move ADR-022 made for `DESIGN.md`.
>
> **Status flags.** This edition was audited against the live code on 2026-06-28. Where a claim
> is built, it is stated plainly. Where a commitment is stated but not yet in code, it is marked
> **⚠️ PLANNED** or **⚠️ COMMITTED but not yet implemented**. Strategic intent that cannot be
> verified from code (persona, usage contexts) is labelled *design intent*.
>
> **Companion docs.** PRODUCT.md = *who it's for and why* · `DESIGN.md` = *what it looks like* ·
> `ARCHITECTURE.md` = *what the system is* · `DECISIONS.md` = *why (ADR log)* · `RULES.md` =
> *what you must / must not do (enforcement)*.

---

## 1. What Simatrix is

Simatrix is a platform of interactive simulations that help B.Tech students build intuition for
engineering concepts and practice solving textbook problems, across multiple disciplines. Each
simulation ships as a sandboxed iframe payload running inside the Simatrix host, and teaches as a
**Guided Stepper**: a progressive-disclosure wizard that sequences one concept at a time.

Every sim must move the learner through the same arc, in order:

1. **Orient.** Start at a single, meaningful first step with one thing to look at. No wall of
   controls. The student always knows where they are and what this step is teaching.
2. **Intuition, step by step.** Each step reveals exactly the control(s) it needs, ties them to a
   live numeric value, and shows the model respond, so the mental model is built one verified idea
   at a time rather than discovered by trial and error.
3. **Problem-solving.** By the final steps, the student can set up a textbook/exam-style problem
   precisely enough that the sim becomes a verification tool, not just a toy.

Success looks like a struggling first-year opening the sim, understanding the first step within 30
seconds, completing the guided sequence without getting lost or feeling stupid, and finishing able
to set up a textbook problem and verify their hand-calculation against the sim.

### What this design contract covers — and what it doesn't

Each Simatrix sim is a self-contained Three.js payload that ships as a sandboxed iframe embedded
inside a host Simatrix website built by separate web developers. This contract governs only the
**inside of that iframe**: the 3D viewport, the step rail, the parameter dock, sliders, toggles,
numeric inputs, inline hints, term definitions, sim-internal buttons, and the animations /
interactions of the simulation itself. The host website's top-level navbar, module browser, account
UI, login flows, marketing pages, footer, and platform-wide chrome are **out of scope** and built
separately. Conceptually, each sim is a teaching aid embedded in someone else's page — a guided 3D
explainer, not a web app. PRODUCT.md and DESIGN.md describe the explainer; the host website has its
own design contract that lives elsewhere.

### Brand personality

Three words: **patient, encouraging, clear.**

Voice: a warm one-on-one tutor sitting beside the student. Never rushes, never patronizes, never
assumes the student should already know. Explains the *why* before the *how*. Labels stay exact
(`angle ∠HP = 45°`, not "tilt it"), but the surrounding copy is plain-spoken and reassuring ("Good —
the slant face is now parallel to HP"). Hints arrive exactly when a step might confuse and step out
of the way once understood.

Encouragement is delivered through **tone and a quiet sense of progress only** — supportive
microcopy and a calm step-progress indicator. It is never delivered through game mechanics. No
points, no streaks, no badges, no confetti, no mascots. The student should feel privately capable,
not rewarded by a machine.

Emotional goal: a student who arrived anxious leaves feeling the concept is learnable and that they,
specifically, learned it. They should sense they are using *real* engineering software with the
intimidation removed, quietly preparing them to recognize professional tools later. The aesthetic
must never undercut the seriousness of the underlying math by drifting into children's-toy or
marketing-site territory.

Reference lane: **best-in-class educational sims** — GeoGebra, Desmos, Wokwi, Falstad's circuit
simulator, Tinkercad. Borrow from them: live-updating values tied to geometry, generous click
targets, labels on things, parameter sliders with visible numeric values, undo-friendly defaults.
Add to them the guided, one-step-at-a-time scaffolding those tools leave to the teacher. Industry
tools (MATLAB, AutoCAD, LTspice) are aspirational endpoints — recognizable in our vocabulary and
layout patterns, not in our chrome.

---

## 2. Who it is for

> *Design intent — not verifiable from code, retained as-is. The audit found nothing in the code
> that contradicts the persona.*

**Primary persona — and the person every decision is optimized for: the struggling first-year** who
finds orthographic projection abstract and intimidating. They may never have seen a technical
drawing, have no CAD or MATLAB exposure, and quietly assume they are "bad at this." If a choice helps
the confident student but risks losing this learner, the weaker learner wins. Stronger students are
still well served by a clear guided path; they are never served at the expense of the struggling one.

This persona is used across three contexts that share one interface language:

- **Self-study.** Student alone on a personal laptop, no instructor present, often anxious. The
  dominant context. The sim must teach without a teacher: each step states what to do and why,
  defines vocabulary inline the first time it appears, and never advances faster than the idea.
- **Classroom.** Instructor demonstrates on a projector or shared screen. The current step, its
  controls, and the viewport must be readable from the back row. The sim defaults to a meaningful
  first step, not a blank canvas.
- **Assessment / homework.** Student reproducing textbook problems. Even inside a guided flow, the
  sim must support precise numeric parameter entry, hold state during a task, and reset cleanly
  without losing intent.

The interface must not assume prior tool fluency, but should make that fluency feel earned by the
time the student meets professional software (AutoCAD, MATLAB, LTspice, LabVIEW) in senior courses or
industry.

---

## 3. What it is not (anti-references)

> *Unchanged from the original. The audit verified that nothing in either module's code contradicts
> these five boundaries (see DECISIONS.md ADR-021 for the one documented, deliberate Principle-2
> trade-off in the Lines workbench).*

Lock these out across every sim. These set the boundary for visual, interaction, and copy decisions
on every screen.

- **Gamified EdTech** — Duolingo-style mascots, confetti animations, badges, streaks, points,
  character illustrations, cartoon-styled geometry. Engineering does not need bribes to be
  interesting. Encouragement lives in tone and a quiet progress indicator, never in game mechanics.
  (This boundary holds even though the personality is now warmer: warmth is voice, not reward
  systems.)
- **Glossy / architectural-viz aesthetic** — Lumion-style PBR renders, glassmorphism, soft
  consumer-app gradients, drop-shadow-heavy "card" UI, ambient occlusion baked into hero shots.
  Engineering drawings are flat ink-on-surface; the sims must respect that convention.
- **Marketing-site polish** — hero gradient text, oversized lifestyle imagery, parallax scroll,
  "look how modern we are" type treatments. The sim is the product, not its presentation layer.
- **Hard industry-tool mimicry** — dark IDE chrome by default, undocumented icon-only toolbars,
  dense panels with no labels, MATLAB-1998 visual density. Real tools look this way because of
  legacy, not because students benefit.
- **Overwhelming dashboard** — every slider, toggle, and readout exposed at once. This is exactly
  what the Guided Stepper replaces. Density without sequence intimidates the struggling learner;
  controls appear when their step needs them.

---

## 4. Core design principles

Seven strategic principles. They override taste in conflicts and apply uniformly across Engineering
Graphics, Mechanical, Civil, EEE, and CS sims. Each carries its enforcement pointer from the audit.

1. **Design for the struggling learner first.** When a decision helps the confident student but
   risks losing the anxious first-year, the weaker learner wins. This is the tie-breaker that
   resolves every other conflict.
   → *This is a **meta-principle**: it governs how the other six are weighed, not a mechanical
   do/don't. It is intentionally **not** a RULES.md checklist item because it cannot be mechanically
   verified — there is no single line of code to point at. (Audit decision, 2026-06-28.)*

2. **One idea per step (progressive disclosure).** Reveal only the controls and information the
   current step needs. The learner is never asked to choose from a field of options they do not yet
   understand. Complexity unfolds as comprehension grows; nothing appears before it is needed.
   → *Enforced **architecturally**, not by a single named rule: the Guided Stepper itself (Module 2
   `stepper.js`; Module 1 engine `renderStep`/`buildRail`), RULES.md §3.28 (new lessons are new thin
   pages, not engine changes), and ADR-011 / ADR-017. ADR-021 records the one deliberate exception
   (the Lines "workbench" surfaces the full driver set at once for the solve-and-verify phase).*

3. **One language, many disciplines.** A control labeled the same way means the same thing in every
   sim. A slider in an orthographic-projection sim behaves the same as a slider in an RC-circuit sim,
   and a step rail works identically across modules. Students should move between Module 1 and Module
   20 without re-learning the chrome. Shared tokens, shared component vocabulary, shared interaction
   patterns.
   → *See RULES.md §4.1–§4.3 (token discipline), §4.15/§4.16 (single root `DESIGN.md`), and
   §7.1–§7.5 (cross-module harmony) for enforcement.*

4. **Show real values, not vibes.** Every parameter the math depends on is visible as a number, in
   its real units (degrees, millimetres, volts, newtons). No "drag until it feels right" without a
   numeric readout. This is the single biggest separator between educational toys and engineering
   tools — and it matters more, not less, for a guided flow.
   → *See RULES.md §4.8 (the Tabular Rule — every live numeric value in IBM Plex Mono with
   `tabular-nums`) for enforcement.*

5. **Educational scaffolding, industry vocabulary.** Use the words the textbook uses — apothem,
   slant height, KVL, second moment of area — not consumer rewrites. Provide an inline explanation
   the first time a term appears, but never replace the term itself. For the struggling learner this
   inline definition is essential, not optional. The goal is fluency with the real vocabulary, not
   avoidance of it.
   → *See RULES.md §6.7 (textbook wording verbatim) and §6.15 (never rename hard-coded viewport
   labels) for enforcement.*

6. **Inclusive by default.** Every color-coded element carries a second non-color cue (dash pattern,
   line weight, label, icon, arrow direction). Animations respect reduced-motion preferences. All
   controls reachable by keyboard with visible focus. Screen readers narrate parameter changes and
   step transitions. Non-negotiable across the platform, not a per-sim decision.
   → *See RULES.md §4.6 (Two-Cue Rule), §4.12 (≥44px targets + visible focus halo), and §4.13
   (reduced motion) for enforcement. See §7 below for per-commitment implementation status.*

7. **Quiet chrome, loud subject.** Every UI pixel that is not the simulation viewport stays quiet
   enough that the math, geometry, circuit, or structure is what the eye lands on. Restrained color,
   minimal decoration, no surface that competes with sim content. The guidance directs attention; it
   does not become the spectacle. The sim is the lesson; the UI is the instrument that exposes it.
   → *See RULES.md §4.4 (Quiet Chrome Rule, ~10% blue accent), §4.5 (Chrome-Only Blue Rule), and
   §4.9 (Flat-Ink Rule) for enforcement.*

---

## 5. Features — Module 1 (audit-verified)

*Module 1 = "Engineering Graphics: Foundations of Projection." Seven live 3D guided-stepper lessons
on one shared engine. All items below were confirmed present in `Module1/src/engine.js`,
`Module1/index.html`, and the lesson data files (2026-06-28). PRODUCT.md is platform-level, so it
never named these; they are recorded here for the first time.*

- **Seven guided lessons** — five intro lessons (the two reference planes · types of lines ·
  dimensioning · the four quadrants · first-angle projection) plus two simulations (**Projection of
  Points**, **Projection of Straight Lines**), all built on one `engine.js` + `shell.css` so they
  cannot drift. **EXISTS.**
- **Guided Stepper** — vertical numbered step rail, progressive disclosure (each step reveals only
  the `.ctrl` controls it needs), Back/Next/jump navigation, "Step N of M" indicator. **EXISTS.**
- **Compare View** — the main pane is always the live 3D scene; the 2D textbook drawing (or, while
  folded, a live-rebuilt 3D view) appears on demand in a floating Compare card, with a docked
  side-by-side split for Points/Lines. **EXISTS.**
- **Cinematic reversible fold/unfold** — the HP plane hinges flat onto the VP about the xy fold line
  and back again, holding the learner's own 3D viewing angle (Points/Lines) or sweeping square-on
  (First-angle). **EXISTS.**
- **Dual perspective/orthographic camera + quick-views** — Top/Front/Side orthographic quick-view
  chips with a perspective↔ortho morph, plus clip-aware auto-zoom and a connector/projector
  declutter toggle. **EXISTS.**
- **Lines "workbench"** — the expanded Compare split collapses the wizard for a true 50/50 and docks
  the live driver controls (True Length, distance HP/VP, θ, φ) under both panes (ADR-021).
  **EXISTS.**
- **Inline term glossary** — dotted-underline terms open a `#term-pop` tooltip on hover/focus/click,
  fed by per-lesson TERMS data. **EXISTS.**
- **Problem Library** (Points/Lines) — tiered textbook problems, hints revealed one at a time, and a
  ±0.5-tolerant self-check that never auto-fills (the student dials the setup; the check lights
  green). **EXISTS.**
- **Onboarding** — one-time "Drag to rotate" orbit hint + queued contextual spotlights. **EXISTS.**
- **Feedback & resilience** — success toast, inline two-state Reset confirm, per-step quiet done
  badge ("quiet progress, not a reward"), invalid-entry recovery ("Kept N …"), and WebGL
  context-loss recovery. **EXISTS.**
- **Platform contract** — `window.simAPI { pause, resume, reset }`, four-field `meta.json`,
  self-starting on load, and a dismissible mobile notice below 768px. **EXISTS** (mobile-notice
  wording diverges from the platform contract — see §7).

---

## 6. Features — Module 2 (audit-verified)

*Module 2 = "Orthographic Projection of Solids" (the master codebase). All items below were confirmed
present in `Module2/main.js`, `Module2/src/uiManager.js`, and `Module2/index.html` (2026-06-28).*

- **Guided Stepper** — six gated steps (1 Add & rest → 2 Position & incline → 3 Label vertices →
  4 Top & front views → 5 Side view → 6 Flatten to 2D), driven by `stepper.js` against a numbered
  rail with progressive disclosure. **EXISTS.**
- **Shape vocabulary** — cube, prism, pyramid (triangular…hexagonal), cylinder, and cone, each a
  hard-edged generator following the `iShape` contract. **EXISTS.**
- **Parameter dock** (`uiManager.js`) — base length, height, distance HP, distance VP, angle HP,
  angle VP, manual Y rotation; every slider paired two-way with a clamped numeric input (tolerates a
  decimal comma); resting-plane choice and a "VP distance measured to nearest point / axis" switch.
  **EXISTS.**
- **Rotation priority hierarchy** — Face Inclination HP/VP (mutually exclusive, pyramids+cone only) ▸
  Orient-to-Corner/Edge preset ▸ Manual Y; a higher mode disables the lower via toggle wiring.
  **EXISTS.**
- **Orthographic projections + vertex labeling** — top view (HP, teal solid), front view (VP, amber
  dashed), side view (PP, violet), hidden edges dashed, connector lines to each view; base corners
  lettered (A, B, C…), apex marked O, axis drawn as a chain line. **EXISTS.**
- **Inline term glossary** (`terms.js`), **Problem Library** (`problemLibrary.js`, tiered + staged
  hints + ±0.5 self-check, never auto-fills), and **onboarding** (empty-state, orbit hint,
  spotlights). **EXISTS.**
- **Live values tied to geometry** — every change funnels through one `rebuild()` pipeline (dispose →
  resolve angles → generate → seat → analyze edges → draw projections → label → notify). **EXISTS.**
- **Platform contract** — `window.simAPI { pause, resume, reset }` (single reset path, guarded by an
  inline confirm), four-field `meta.json`, self-starting, and a dismissible "Best experienced on
  desktop." notice below 768px (`#mobile-notice`, role=status). **EXISTS.**

---

## 7. Accessibility commitments (with implementation status)

Accessibility is a defining goal of this product, not a compliance afterthought — the primary persona
is precisely the learner most failed by inaccessible tools.

**Target: WCAG 2.2 AA across all Simatrix sims**, with these specific commitments. Status verified
against the code on 2026-06-28.

| Commitment | Status |
|---|---|
| **Color is never the only signal.** Every domain-specific color encoding also uses a second cue (dash style, weight, arrow direction, label). | **IMPLEMENTED** — RULES.md §4.6; HP solid/teal vs VP dashed/amber, both modules. |
| **Contrast.** Body text and meaningful linework meet WCAG AA against their immediate surface, verified on the base surface (clinical base gray `#f5f5f5` / white `#ffffff` per the 2026-07-09 North Star) and a dim-projector scenario. | **ASSERTED** — token-based palette; not independently re-measured in this audit, and must be re-verified when the clinical-palette code phase lands. See §9. |
| **Keyboard.** Every control reachable with a visible focus ring; tab order matches reading order; sliders respond to arrow keys with sensible step sizes; Next/Back keyboard-operable. | **IMPLEMENTED** — `:focus-visible` rings (M2 ×18, M1 ×17); native controls; angle sliders `step="1"` give 1° arrow steps. |
| **Keyboard — Shift+arrow for finer steps.** | **⚠️ COMMITTED but not yet implemented** — no `shiftKey` handling exists in any module. See §8. |
| **Reduced motion.** `prefers-reduced-motion: reduce` collapses transitions, draw-on, camera easing, and decorative animation to instant state changes; the simulation still updates. | **IMPLEMENTED** — both modules honor it and snap to the end state. |
| **Screen readers.** Controls carry ARIA labels and `aria-valuetext`; a live region announces step and mode changes; every value driving the viewport, and every step instruction, is surfaced as readable text. | **IMPLEMENTED** — `aria-valuetext` on sliders, `#live` (`aria-live=polite`), ~44 `announce()` call sites, plus `cfg.describe()` viewport mirror (M1). |
| **Legibility-first typography.** Body typeface chosen for maximum legibility (disambiguated letterforms). | **IMPLEMENTED** — bundled Atkinson Hyperlegible woff2 (no Google-Fonts CDN). |
| **Known accommodations.** ~8% color-blind male students, classroom-projector users in the back row, keyboard-only laptop users, motion-sensitive users, low-vision and reading-fatigued learners. | *Design intent* — served by the mechanisms above. |

**Mobile notice (platform contract, ARCHITECTURE.md §7 / RULES.md §2.13 — "dismissible best-on-desktop
notice below 768px"):**

- **Module 2 — matches the contract exactly.** `#mobile-notice`, text "Best experienced on desktop.",
  `role=status`, dismissible, shown below 768px. **IMPLEMENTED.**
- **Module 1 — PARTIAL / drift.** A dismissible notice exists (`#mobile-note`, `role=note`, shown
  below 768px), but its **text differs**: "The 3D view stays pinned at the top while you scroll
  through the steps. Drag it to orbit the two planes." Different element id and different wording from
  the platform contract. The notice is present and dismissible; only the wording is off-contract. See
  §8/§9.

---

## 8. Planned but not yet implemented

- **⚠️ PLANNED — Shift+arrow for finer slider steps.** The accessibility contract promises
  "Shift+arrow for finer steps," but no module implements `shiftKey` handling on sliders. Arrow keys
  already step by the native amount (1° on angle sliders); the finer Shift+arrow increment needs to
  be added in `Module2/src/uiManager.js` and the Module 1 engine's slider wiring.
- **⚠️ PLANNED — reconcile Module 1's mobile-notice wording.** Either align Module 1's `#mobile-note`
  text to the platform-contract "Best experienced on desktop." (matching Module 2 and RULES.md
  §2.13), or formally bless the more informative Module-1 wording as an intentional per-module
  exception and update the contract. Until then it is a documented drift.

---

## 9. Open questions

- **Contrast — independent verification.** WCAG AA contrast is asserted via the token palette but was
  not re-measured in this audit. A measured pass against both the base surface and a
  dim-projector scenario would move the §7 row from ASSERTED to IMPLEMENTED. The 2026-07-09
  clinical-palette reversal (base gray `#f5f5f5`, white `#ffffff` — see DESIGN.md §2) makes this
  measurement mandatory before the palette code phase ships: every ink/accent/encoding ratio was
  computed against the retired warm-paper surface.
- **Module 1 mobile-notice wording (see §8).** Is the divergence a bug to fix or an intentional,
  better-targeted message to bless? Needs a product call.
- **Principle 1 enforcement — resolved.** Decided 2026-06-28: no RULES.md rule; P1 stays a
  meta-principle (see §4). Listed here only to record that it was considered and closed.
