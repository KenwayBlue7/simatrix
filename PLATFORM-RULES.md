# Simatrix — Platform Rules (Subject-Agnostic Foundation)

> **These are the platform-wide rules.** Your subject module will also have its own
> architecture-specific rules — document those in your own `RULES.md` using these as the
> foundation.

This file is extracted from the root `RULES.md` (the Engineering Graphics module family's
enforcement checklist). Every rule below passed one test: **it names no specific codebase file
(`cube.js`, `engine.js`, `uiManager.js`, …) and no specific lesson (Lines, Points, …).** If a
source rule stated a subject-agnostic principle using a subject-specific example, the example was
stripped and the principle generalized — that is noted inline. Anything that only makes sense in
terms of Engineering Graphics' own files, modules, or lessons was left out entirely; see the root
`RULES.md` for that layer.

---

## How to read a rule

> **§N.M ✅ DO** / **❌ NEVER** — the actionable instruction. *(source)*
> Reason: one sentence, only where the why is not obvious.

- The **source** cites the originating ADR or shared doc (`ADR-NNN`, `DESIGN.md`, `ARCHITECTURE.md`,
  `CLAUDE.md`) so you can trace the reasoning back to the root `DECISIONS.md` if you want the full
  story.
- Rules are absolutes. There is no "consider" or "try to." If a real exception exists, it is its
  own rule.
- When you add a subject-specific rule of your own, follow the same **✅ DO** / **❌ NEVER** +
  citation format so contributors can scan yours and the platform's rules the same way.

---

## Section 1 — Platform & Runtime Contract

> **§1.1 ❌ NEVER** add a `package.json`, npm, Vite, Webpack, or any bundler/build artifact. Every
> sim is plain files served over HTTP. *(ADR-001, CLAUDE.md)*

> **§1.2 ❌ NEVER** load a third-party library via its UMD global, an `@latest`/floating version
> tag, or an npm install. *(ADR-001, CLAUDE.md)*
> Reason: generalized from the original Three.js-specific wording — the "no unpinned dependency"
> contract applies to whatever library your subject module happens to depend on.

> **§1.3 ✅ DO** load every external library as ES modules through an import map pinned to an
> **exact version** from a CDN (e.g. jsDelivr). *(ADR-001, CLAUDE.md)*
> Reason: a pinned version cannot silently change under the sim, preserving reproducibility and
> offline use.

> **§1.4 ✅ DO** include the file extension on every import (`./src/x.js`). *(ADR-001, CLAUDE.md)*
> Reason: with no bundler/resolver, extensionless imports 404.

> **§1.5 ✅ DO** use only relative asset paths (`./assets/...`), never absolute (`/assets/...`).
> *(ADR-001, CLAUDE.md)*
> Reason: the host serves the payload from an arbitrary URL prefix.

> **§1.6 ✅ DO** serve every sim over real HTTP (locally: XAMPP Apache on port 8080,
> `http://localhost:8080/Simatrix/...`). `file://` fails ES-module CORS; port 80 is held by Windows
> IIS and 404s. *(ADR-001)*

> **§1.7 ✅ DO** hard-reload after an edit before assuming a change is broken — Apache sends no
> `Cache-Control`, so Chrome serves stale modules. *(ADR-001)*

> **§1.8 ✅ DO** expose `window.simAPI` with exactly `pause()`, `resume()`, and `reset()`. *(ADR-002,
> CLAUDE.md)*

> **§1.9 ❌ NEVER** create a second reset path — any in-sim Reset control must route through
> `simAPI.reset()`. *(ADR-002, CLAUDE.md)*

> **§1.10 ❌ NEVER** add `postMessage`, `window.parent`, or `window.top` usage anywhere. The
> host↔sim surface is `window.simAPI` + `meta.json` only. *(ADR-002, ARCHITECTURE.md §6)*

> **§1.11 ✅ DO** ship a `meta.json` at the sim's root with all four fields — `title`,
> `description`, `difficulty`, `tags`. Uploads missing any field are rejected. *(ADR-002, CLAUDE.md)*

> **§1.11a ❌ NEVER** use a capitalised difficulty value in meta.json. The backend requires
> exactly: `beginner`, `intermediate`, or `advanced` (all lowercase). *(Live bug found
> 2026-07-02 — affected all meta.json files at initial discovery)*

> **§1.12 ❌ NEVER** make a runtime network call beyond the one-time, pinned-version CDN fetch for
> whatever library you depend on; the sim must work fully offline once loaded. *(ADR-002, CLAUDE.md)*

> **§1.13 ✅ DO** render only a dismissible "Best experienced on desktop" banner below 768px — never
> block, redirect, or disable the sim. *(CLAUDE.md)*

> **§1.14 ✅ DO** make the sim self-starting on page load; there is no external `init()` call.
> *(CLAUDE.md)*

> **§1.15 ✅ DO** bundle fonts as local `woff2` (Atkinson Hyperlegible + IBM Plex Mono) loaded via
> `@font-face`; **never** use a Google-Fonts CDN. *(ARCHITECTURE.md §7, CLAUDE.md)*
> Reason: these two fonts are the platform's own shared typography, defined in the root design
> system — not something each subject module chooses independently.

---

## Section 2 — UI & Visual Rules

> This section is the platform-wide UI parity standard. Full statements live in the root
> `DESIGN.md`.

> **§2.1 ❌ NEVER** hard-code a hex value in JS or component CSS. *(ADR-003, DESIGN.md)*
> Reason: CSS design tokens are the single runtime source of truth for all visual values.

> **§2.2 ✅ DO** read every colour from a CSS custom property at runtime via
> `getComputedStyle(document.documentElement).getPropertyValue('--token').trim()`. *(ADR-003,
> DESIGN.md)*

> **§2.3 ✅ DO** declare any new colour as a token and pass it through your module's token config —
> never inline a literal. *(ADR-003, CLAUDE.md)*

> **§2.4 ✅ DO** keep the blue accent to ~10% of the chrome (the Quiet Chrome Rule). *(DESIGN.md)*

> **§2.5 ❌ NEVER** put blue linework inside the working viewport — blue is chrome/guidance only
> (the Chrome-Only Blue Rule). Viewport meaning uses your subject's own functional colour encodings
> instead. *(DESIGN.md)*

> **§2.6 ✅ DO** pair every colour signal with a second cue — dash, weight, label, icon, arrow, or
> shape (the Two-Cue Rule). *(DESIGN.md)*

> **§2.7 ✅ DO** build type hierarchy from size and the 700 bold only — never a 500/600 weight (the
> Two-Weight Rule; Atkinson ships 400/700 only). *(DESIGN.md)*

> **§2.8 ✅ DO** set every live numeric value in IBM Plex Mono with `tabular-nums` (the Tabular
> Rule). *(DESIGN.md)*

> **§2.9 ❌ NEVER** cast a shadow on rendered content, or use elevation as decoration (the Flat-Ink
> Rule). Shadows lift transient overlays only. *(DESIGN.md)*

> **§2.10 ✅ DO** convey structure with a single crisp 1px hairline (`#d9d2c3`) and tonal layering,
> not a drop shadow (the Border-Over-Shadow Rule). *(DESIGN.md)*

> **§2.11 ❌ NEVER** use a bare `#000` or `#fff`. White host-blend cards consume the single
> `--color-host-white` token (the narrowly-scoped Host-Integration White Exception). *(DESIGN.md)*

> **§2.12 ✅ DO** keep every interactive target ≥ 44px with a visible accent focus halo. *(DESIGN.md)*

> **§2.13 ✅ DO** collapse all motion to instant under `prefers-reduced-motion`; the simulation
> still updates to the end state. *(DESIGN.md)*

> **§2.14 ✅ DO** keep ownership of UI DOM in one designated owner per module — never let two parts
> of the code fight over the same chrome/dock. *(ARCHITECTURE.md §3, CLAUDE.md)*
> Reason: generalized from the original wording, which named the two Engineering Graphics owner
> files directly — the principle (single owner per DOM region) is what transfers, not the file names.

> **§2.15 ✅ DO** treat the root `DESIGN.md` as the single source for the shared design system —
> there is exactly one copy. Any module-specific application notes (e.g. which selectors take the
> Host-White Exception) belong in your own module's design-doc appendix, never in a duplicated
> shared file. *(ADR-010, DESIGN.md)*
> Reason: duplicated shared docs drift; one root file removes the drift surface entirely.

> **§2.16 ❌ NEVER** re-define a shared token in a module's local design-doc appendix — the
> appendix adds only that module's own encodings. The root `DESIGN.md` wins on conflict. *(ADR-010,
> DESIGN.md)*

> **§2.17 ✅ DO** give every pressable control the shared press language — `transform: scale(0.97)`
> on `:active:not(:disabled)`, easing back over `--dur-fast`. **❌ NEVER** use a 1px translate.
> *(DESIGN.md §5.1)*

> **§2.18 ✅ DO** verify a token's canonical name against the current root `DESIGN.md` and code, not
> against a stale doc — if a doc and the implementation disagree, the implementation plus a doc fix
> wins, not a newly-invented parallel token name. *(DESIGN.md)*
> Reason: generalized from a specific token-name correction — the transferable lesson is "verify,
> don't assume the doc is current," not the specific token names involved.

> **§2.19 ✅ DO** guard any destructive control (Reset and equivalents) with an inline **two-state
> confirm** — the first click arms it ("Reset everything? · Yes / Cancel"), and only "Yes" fires the
> actual reset. **❌ NEVER** wire a destructive control to fire on a single click. *(DESIGN.md §5.1;
> ADR-002)*
> Reason: a stray click must not destroy work; the single reset path (§1.9) is still the only wipe
> route.

> **§2.20 ✅ DO** lay out the guided-stepper wizard as a horizontal row — `.wizard-main { display:
> flex; flex-direction: row }` — with the step card on the left (`order: 1`) and the step rail on
> the right (`order: 2`). This is the shared wizard shape for every guided-stepper sim, not a
> per-topic style choice. *(DESIGN.md §4.5)*

> **§2.21 ✅ DO** show scroll containers with the floating, padded scrollbar pill — a 10px WebKit
> channel, transparent track, thumb tinted to `--color-border` via `background-clip: padding-box` +
> a transparent border — rather than hiding the scrollbar. **❌ NEVER** hide a scrollbar entirely
> (`scrollbar-width: none` / `::-webkit-scrollbar { display: none }`); a student on a short screen
> needs the visual cue that content continues below the fold. *(ADR-032, DESIGN.md §5.11)*

> **§2.22 ✅ DO** lay out each step-rail button (`.rail__btn`) with `flex-direction: column` so the
> text label stacks *below* the step marker, not beside it. This keeps the vertical rail narrow and
> stops long step titles ("First-Angle Setup") from pushing the button — and the whole wizard — wide.
> Pair it with a `max-width` on `.rail__label` so titles wrap instead of stretching the rail. *(DESIGN.md §5.6)*

---

## Section 3 — Cross-Subject Harmony

> What every subject module shares with every other one, regardless of what engineering discipline
> it teaches.

> **§3.1 ✅ DO** treat the root `PRODUCT.md` as the single platform-wide product contract — there is
> exactly one copy; your module references it, it never gets a per-module duplicate. *(ADR-023,
> ARCHITECTURE.md §7)*
> Reason: duplicated copies are a latent drift point; one root file removes the drift surface.

> **§3.2 ✅ DO** consume the single root `DESIGN.md` and keep the platform's import/runtime contract
> — no build step, pinned exact-version external libraries, `.js`-extensioned imports, relative
> paths — identical to every other subject module. *(ARCHITECTURE.md §7, ADR-010)*

> **§3.3 ✅ DO** re-learn a module's own architecture before editing it — fluency in one subject
> module's codebase does not transfer to another's, even on this same platform. *(ARCHITECTURE.md
> §9.5)*

> **§3.4 ✅ DO** treat a module's large hub/orchestrator files as load-bearing; read the surrounding
> code before editing, even when the change you want looks small. *(ARCHITECTURE.md §9.6)*
> Reason: generalized from named examples of specific oversized files — the principle (big hub
> files carry hidden coupling) is what transfers.

---

## Section 4 — Documentation Rules

> **§4.1 ✅ DO** add an ADR to your `DECISIONS.md` whenever you make a non-obvious decision —
> especially one with two real options. *(DECISIONS.md)*

> **§4.2 ✅ DO** add a dated entry to the relevant `CHANGELOG.md` after any bug fix, feature, or
> significant change (what changed and why it mattered). *(CLAUDE.md)*

> **§4.3 ✅ DO** update your `ARCHITECTURE.md` when you change the structure it describes (a new
> module file, a moved responsibility, a new shared/duplicated file). *(ARCHITECTURE.md)*

> **§4.4 ❌ NEVER** silently reverse a documented decision. If you overturn an ADR, write a new ADR
> that supersedes it — do not just change the code. *(DECISIONS.md)*

> **§4.5 ✅ DO** keep cross-references pointing at files that actually exist — audit your own doc
> set periodically rather than letting a reference rot after a rename or merge. *(ARCHITECTURE.md
> §9.3)*
> Reason: generalized from a specific historical broken reference — the transferable habit is the
> periodic audit, not the anecdote.

> **§4.6 ❌ NEVER** restore a design that an ADR records as superseded just because the current code
> "looks wrong" — check `DECISIONS.md` first; it may be a deliberate, already-reasoned-through
> choice. *(ADR-driven; see your own DECISIONS.md)*
> Reason: generalized from a list of specific superseded designs — the rule is "check history before
> reverting," regardless of which designs your own module has superseded over time.

---

## Section 5 — Anti-Patterns (Quick Scan)

> The subject-agnostic subset of the 60-second scan. If you're about to do one of these on a new
> subject module, stop and read the cited rule first.

**Build / runtime**
- ❌ Add `package.json`, npm, or any bundler. *(§1.1)*
- ❌ Use a UMD global, `@latest`, or an unpinned external library. *(§1.2)*
- ❌ Write extensionless or absolute-path imports. *(§1.4, §1.5)*
- ❌ Open the sim from `file://` or assume port 80 works. *(§1.6)*
- ❌ Add `postMessage`/`window.parent`/`window.top`, a second reset path, or any network call beyond
  the one-time pinned CDN fetch. *(§1.9, §1.10, §1.12)*

**UI / visual**
- ❌ Hard-code a hex in JS or component CSS. *(§2.1)*
- ❌ Put blue inside the working viewport, or let a functional colour encoding double as the chrome
  accent. *(§2.5)*
- ❌ Use a 500/600 font weight, a bare `#000`/`#fff`, or colour as the only signal. *(§2.7, §2.11,
  §2.6)*
- ❌ Cast a shadow on rendered content, or use elevation as decoration. *(§2.9)*
- ❌ Re-define a shared token in a module's local appendix. *(§2.16)*
- ❌ Wire a destructive control (Reset, etc.) to fire on a single click instead of a two-state
  confirm. *(§2.19)*

**Cross-subject / docs**
- ❌ Ship an `index.html` `<title>` that disagrees with `meta.json.title`. *(§1.11; ADR-026)*
- ❌ Use a capitalised difficulty value in meta.json ("Intermediate" not "intermediate"). *(§1.11a)*
- ❌ Reintroduce a per-module `DESIGN.md`/`PRODUCT.md` instead of consuming the root copies.
  *(§3.1, §3.2)*
- ❌ Silently reverse a documented decision, or restore an ADR-superseded design. *(§4.4, §4.6)*

---

*Extracted from the root `RULES.md` — the platform-contract subset of its §2, all of its §4, the
subject-agnostic subset of its §7 ("Cross-Module Harmony," renamed here to "Cross-Subject
Harmony"), all of its §8, and the matching subset of its §9. RULES.md itself remains the
authoritative source; if the two ever disagree, treat that as drift to fix, not a real conflict —
re-sync this file from RULES.md.*
