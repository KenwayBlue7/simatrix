# CLAUDE.md — Simatrix · [Subject Name] · [Module/Topic Name]

> **TEMPLATE — replace every bracketed `[ ]` placeholder before this file is used to guide real
> development.** This template carries only the **platform-wide** contract (shared by every
> Simatrix subject, regardless of engineering discipline). It is deliberately silent on Engineering
> Graphics' own architecture (Module 2's orchestrator pattern, Module 1's shared-engine pattern,
> the 3D solid geometry engine, camera/fold behavior, answer-validation specifics) — none of that
> applies to a new subject by default. You decide and document your own.

[One paragraph: what does this subject module teach, and what does the learner see/do? What
engineering discipline is it, and what is this specific module/topic's scope within it?]

---

## Before you write any code

This template — and the root `../PLATFORM-RULES.md` it points to — is the **only** documentation
this subject inherits automatically. Everything else about how your module is built is yours to
decide and record, **before** you write simulation code:

- **`ARCHITECTURE.md`** (this module's own) — the map of your own file structure, component
  breakdown, and data flow. Write it as you design, not after the fact.
- **`DECISIONS.md`** (this module's own) — the ADR log for your subject's own architecture
  decisions (geometry/rendering approach, module boundaries, state flow, anything with two real
  options). Follow the same ADR discipline the platform uses — see the root `PLATFORM-RULES.md`
  §4 (Documentation Rules).
- **`RULES.md`** (this module's own) — your subject's own enforcement checklist, **written on top
  of `../PLATFORM-RULES.md` as its foundation** (that file's own header says as much). Add your own
  ✅ DO / ❌ NEVER rules for whatever your subject needs that the platform rules don't cover: your
  geometry/rendering engine, your viewport color encodings, your camera behavior, your
  problem-library and answer-validation logic, and so on.

**Do not** point this module at the Simatrix root `ARCHITECTURE.md`, `DECISIONS.md`, or `RULES.md`
— those three describe the Engineering Graphics module family (Module 1, Module 2, and their topic
clones) specifically, including decisions and rules that do not apply to a different discipline.
The only root documents every subject shares are `DESIGN.md`, `PRODUCT.md`, and `PLATFORM-RULES.md`
(see below).

---

## Project-wide documentation (read before cross-module tasks)

Before starting any task that touches shared behavior, UI patterns, or cross-subject consistency,
read these root-level files:
- `../DESIGN.md`         — color tokens, typography, component standards (the platform design system)
- `../PRODUCT.md`        — who it's for, features, accessibility commitments (the platform product contract)
- `../PLATFORM-RULES.md` — what every Simatrix module must and must not do, regardless of subject

For module-specific work that doesn't touch shared behavior, reading the root docs is optional but
recommended.

**Design system rules:** Always read and strictly follow the consolidated platform design system
at `../DESIGN.md` (Simatrix root) for all colour, typography, spacing, component styling, and
UI/UX decisions. Strategic context — users, brand personality, anti-references, design principles,
accessibility commitments — lives in the consolidated root `../PRODUCT.md` (the single
platform-wide product contract). Never hard-code design values in CSS or JS — consume tokens
defined in `../DESIGN.md`. For the platform-wide enforcement checklist, see `../PLATFORM-RULES.md`
— your own `RULES.md` extends it, never duplicates or contradicts it.

This module does **not** and must **not** carry a local `DESIGN.md`/`PRODUCT.md` copy. If a
genuine module-local *appendix* is needed later (documenting this subject's own viewport
encodings, for instance), add it as a small file that itself points back to the root, never a
duplicate of the root content.

**Scope boundary:** This module produces a self-contained simulation payload — the working
viewport plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The
host Simatrix website (top-level navbar, module browser, account UI, marketing chrome, login,
dashboard) is built by other web developers and is **out of scope** here. Treat the sim like a
teaching aid embedded in someone else's page: do not render navigation, branding, footer, or any
platform-level UI inside the sim's iframe.

---

## Subject-specific architecture rules

> ⚠️ **TODO — fill this section in before development starts.** Do not begin writing simulation
> code with this section still a placeholder; an undocumented architecture is exactly what lets a
> module drift from itself as it grows. Once filled in, treat these as non-negotiable for this
> module — the same way the platform rules above are non-negotiable for every module.

Document, at minimum:

- **The rendering/geometry approach.** What renders the sim (Three.js? a 2D canvas? something
  else)? If 3D, which pattern — a single orchestrator + leaf modules, a shared engine + thin pages,
  or something new — and why?
- **The single state-change pipeline.** Every subject module needs one disciplined path from "the
  learner changed something" to "the scene reflects it" (naming it, e.g., `rebuild()`), with a
  defined disposal/cleanup contract if it renders anything that must be torn down and rebuilt.
- **Module boundaries.** Which files/components own what, and what may or may not import what else
  (a star topology around one orchestrator is a common, low-drift choice, but decide and record
  your own).
- **Domain-specific viewport encodings.** Any color/line/marker meaning specific to this subject
  (the platform's shared design tokens and rules — Quiet Chrome, Chrome-Only Blue, Two-Cue,
  Two-Weight, Tabular, Flat-Ink, Border-Over-Shadow — still apply; this is only the *domain*
  meaning layered on top, e.g. what a dashed vs. solid line means in your subject).
- **Problem/validation logic, if this module teaches via exercises.** Where target/answer logic
  lives, how tolerant the self-check is, and the rule that loading a problem must never auto-fill
  the answer.

Record the reasoning behind each choice as an ADR in your own `DECISIONS.md`, then translate the
consequence into a rule in your own `RULES.md` (per "Before you write any code" above).

---

## Session Digest Protocol

At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)

## Keeping your own documents current

After completing any task, check whether the work involved:
- A non-obvious decision between two real options → add an ADR to **your own** `DECISIONS.md`
- A reversed or superseded previous decision → update the relevant ADR status in **your own**
  `DECISIONS.md` and add a new one
- A new rule that must be enforced going forward → add it to **your own** `RULES.md` with its
  source ADR cited
- A structural change to the codebase (new files, new relationships) → update **your own**
  `ARCHITECTURE.md`

Do not update these files for routine changes. Only update when the change has architectural or
decision-level significance.

If a task instead surfaces something that should change for *every* Simatrix module — a platform
contract gap, a design-system correction, a rule in `PLATFORM-RULES.md` that turned out wrong —
don't edit the root files unilaterally; flag it, since a root-doc change affects every other
subject module too.
