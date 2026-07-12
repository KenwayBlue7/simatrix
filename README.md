#Simatrix

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
