---
name: Simatrix Guided Stepper — Platform Design System
description: The single, platform-wide visual contract for every Simatrix guided-stepper engineering simulation. Consolidated at the repository root from the former per-module DESIGN.md / DESIGN.shared.md copies, audited against the live code on 2026-06-27.
colors:
  # Canonical CSS custom-property values, verified against Module2/index.html and Module1/src/shell.css.
  # Token NAME is what appears in code as --color-<name>. "solid-fill" is canonical (NOT "geometry-fill").
  accent: "#1f66b5"
  accent-strong: "#17539b"
  accent-soft: "#e3ecf7"
  paper: "#ffffff"
  panel: "#f0f2f5"
  solid-fill: "#e7e1d4"
  ink: "#06070b"
  ink-secondary: "#5a5d66"
  bench-grey: "#938b7b"
  border: "#e0e1e5"
  track: "#e0e1e5"
  hp-line: "#007f7c"
  vp-line: "#bc5d1e"
  pp-line: "#7a5ea6"
  success: "#2e7d52"
  success-soft: "#e2efe8"
  # Module-1-only viewport encodings for the Lines construction aids (see §7).
  construct: "#8a8275"
  locus: "#7b4fb5"
  tl-green: "#1f8a4c"
  construct-ink: "#5e564a"
  locus-ink: "#6a3fa3"
  tl-green-ink: "#166b3c"
typography:
  title:  { fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif", fontSize: "1.35rem",  fontWeight: 700, lineHeight: 1.2,  letterSpacing: "-0.01em" }
  lead:   { fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif", fontSize: "1.125rem", fontWeight: 400, lineHeight: 1.35 }
  body:   { fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif", fontSize: "1rem",     fontWeight: 400, lineHeight: 1.6 }
  label:  { fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif", fontSize: "0.75rem",  fontWeight: 700, lineHeight: 1.2,  letterSpacing: "0.07em" }
  value:  { fontFamily: "IBM Plex Mono, ui-monospace, monospace",       fontSize: "0.875rem", fontWeight: 400, lineHeight: 1.2 }
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
motion:
  dur-fast: "150ms"
  dur-base: "200ms"
  dur-step: "380ms"
  ease-standard: "cubic-bezier(0.22, 1, 0.36, 1)"
---

# Simatrix — Platform Design System (`DESIGN.md`)

## 1. Purpose and scope of this file

This is the **single, platform-wide visual contract** for every Simatrix guided-stepper engineering
simulation, across all disciplines (Engineering Graphics, Mechanical, Civil, EEE, CS). It is the
canonical source for **colour, typography, spacing, radius, base motion, the named design rules, the
component standards, the North Star, and the do's/don'ts.**

It was **consolidated at the repository root on 2026-06-27** by merging the four former design files —
`Module1/DESIGN.md`, `Module1/DESIGN.shared.md`, `Module2/DESIGN.md`, `Module2/DESIGN.shared.md` — into
one, and **auditing every claim against the live code** (`Module2/index.html`, `Module1/src/shell.css`,
`Module1/src/anim.js`, `Module1/src/engine.js`). Where the old docs disagreed with the code, the **code
won**, and the change is marked *"Updated from code audit 2026-06-27."*

**Module 2 is the master.** Where the two former `DESIGN.shared.md` copies differed, the Module 2
version was taken and the Module 1 delta moved into §7 (Module-specific exceptions).

**What's binding for every module:** everything in §2–§6. A control labelled the same way must mean and
behave the same way in every module (PRODUCT.md Design Principle 3, "one language, many disciplines").

**What each module may add on top:** its own domain encodings and viewport behaviour — documented in §7,
**not** by re-defining a shared token. **Where this file and a module appendix conflict on a token or a
named rule, this file wins.** Never hard-code design values in CSS or JS — consume the tokens defined here.

> **Related docs.** Strategic context (users, brand, anti-references, principles, accessibility) lives in
> each module's `PRODUCT.md`. Module 1's deep **premium-interaction implementation** spec (Compare-View
> state machine, cinematic-fold camera orchestration, chrome-injection contract, Problem Library) lives in
> `Module1/DESIGN.md`; this root file carries only the parts of it that are design-system standards (the
> motion palette, the z-index ladder, the press conventions, the component specs). Enforcement rules are in
> `../RULES.md`; the reasoning behind decisions is in `../DECISIONS.md`.

---

## 2. Color system

**Creative North Star: "The Patient Tutor's Paper."** This is the surface a patient one-on-one tutor works
on, beside an anxious first-year who is sure they are "bad at this." A clean clinical sheet — pure-white
base (`#ffffff`) with neutral-gray working surfaces (`#f0f2f5`) and dark ink — matching the web team's
host-site palette so the sim reads as one seamless page, not a tinted inset. Calm comes from clarity and
order, not from tint: the patience lives in the voice, the pacing, and the quiet chrome. The chrome is
near-monochrome and quiet so the only things that raise their voice are the **content in the viewport** and
the single **ink-blue accent** that walks the learner from one step to the next. Saturated colour is
rationed to two jobs and two only: the functional engineering encodings inside the scene, and the one blue
accent that guides attention through the wizard.
*(Rewritten 2026-07-09, Phase 1 Documentation Reversals — the former "warm off-white drafting paper,
deliberately not clinical" framing is retired in favour of the web team's clinical palette.)*

### 2.1 The token table (verified against code)

Every value below is the **live CSS custom property** in `Module2/index.html` (`:root`) and
`Module1/src/shell.css` (`:root`). The two files were confirmed **identical** for every shared `--color-*`
token. Authored in OKLCH for intent, stored as resolved sRGB hex because `THREE.Color` cannot parse
`oklch()`. The four clinical neutrals (`panel`, `ink`, `ink-secondary`, `border`) were re-derived from the
platform's clinical LAB source and cooled off their former warm values on **2026-07-11 (ADR-040)** — the
accent and every HP/VP/PP domain encoding were deliberately left untouched.

| Token (`--color-…`) | Value | OKLCH intent | Semantic meaning |
|---|---|---|---|
| `paper` | `#ffffff` | — | Pure-white base **and content surfaces**: app + viewport background; raised control fills; the step card, `#active-problem` (statement + hints), `.problem-card`, the `.problem-library` page, and the `.compare-card` frame + stage. *(Clinical palette; paper/panel tones swapped 2026-07-09, Phase 1 Corrections; content surfaces returned to white in the same phase.)* |
| `panel` | `#f0f2f5` | LAB (clinical) | Neutral cool-gray working surface (host-site match): the wizard/dock shell (step rail included) and viewport chrome chips (wizard toggle, quick-views, connector, `.vp-hint`/spotlights), one tonal step **below** paper. The former `host-white` token is retired — content cards sit on `paper` against this grey shell. *(Cooled from `#f5f5f5` to the clinical LAB neutral 2026-07-11, ADR-040.)* |
| `solid-fill` | `#e7e1d4` | 0.90 0.013 88 | Rendered 3D geometry faces, light enough that dark ink edges read. **Canonical name is `solid-fill`** — see §8. *(Still the shipped warm value; re-derivation as a neutral gray is a later code phase.)* |
| `ink` | `#06070b` | LAB (clinical) | Primary text + visible geometry edges (~20:1 on paper). *(Cooled from warm `#221f18` to the clinical LAB near-black 2026-07-11, ADR-040.)* |
| `ink-secondary` | `#5a5d66` | LAB (clinical) | Secondary text, leads, helper copy (~6.6:1 on paper, AA). *(Cooled from warm `#564e3c` 2026-07-11, ADR-040.)* |
| `bench-grey` | `#938b7b` | 0.62 0.012 88 | Hidden-edge linework, reference grids, inactive linework, disabled lock cue. **CRITICAL: 3.4:1 contrast. Strictly for non-text linework and disabled UI only. Fails AA for text.** |
| `border` | `#e0e1e5` | LAB (clinical) | Crisp 1px structural seams and dividers. *(Cooled from warm `#d9d2c3` 2026-07-11, ADR-040; ~1.31:1 as the scrollbar-pill tint — see §5.11.)* |
| `track` | `#e0e1e5` | LAB (clinical) | Recessed slider groove. Harmonized to equal `--color-border` so the slider groove matches the scrollbar-pill tint (the former warm `#cfc8b8` was the last neutral missed by ADR-040 — 2026-07-11). |
| `accent` | `#1f66b5` | 0.52 0.14 252 | The one interaction accent: current step, primary action, selection, slider fill, focus ring (~5.6:1 on paper). |
| `accent-strong` | `#17539b` | 0.45 0.14 252 | Accent hover / active. |
| `accent-soft` | `#e3ecf7` | 0.94 0.025 252 | Current-step pill, hint callouts, term popovers. |
| `success` | `#2e7d52` | 0.56 0.10 158 | A completed step — **always** with a check glyph, never colour alone. |
| `success-soft` | `#e2efe8` | 0.94 0.03 158 | Completion-state wash. |
| `hp-line` (HP Teal) | `#007f7c` | 0.53 0.11 192 | Horizontal-Plane projection (top view), drawn **solid**. Held off blue (~4.57:1). |
| `vp-line` (VP Amber) | `#bc5d1e` | 0.58 0.12 55 | Vertical-Plane projection (front view), drawn **dashed**. Teal↔amber is the CVD-safe pair (~4.19:1). |
| `pp-line` (PP Violet) | `#7a5ea6` | 0.55 0.10 305 | Profile-Plane projection (side view), the third plane. Held off chrome blue (h305 vs 252) and clear of teal/amber (~4.5:1). **Actively used in Module 2; defined-but-unused in Module 1 — see §7/§8.** |

**Derived / non-colour tokens** also live in `:root` and are part of the contract:
`--color-focus` (= `--color-accent`), `--ring-focus` (`0 0 0 3px color-mix(in srgb, var(--color-accent) 26%, transparent)` — the focus/drag halo), and `--shadow-md` (`0 4px 16px color-mix(in srgb, var(--color-ink) 12%, transparent)` — the transient-overlay shadow).
*(Added from code audit 2026-06-27 — these existed in code but were only described as prose concepts in the old docs.)*

### 2.2 Module-1 construction-aid encodings (Lines sim)

*(New section — added from code audit 2026-06-27. These tokens exist in `Module1/src/shell.css` and are
used by the Lines sim's Traces / True-Length constructions, but no previous design doc listed them.)*

| Token | Value | Meaning |
|---|---|---|
| `--construct` | `#8a8275` | Neutral drafting-aid grey — construction / projector lines. |
| `--locus` | `#7b4fb5` | Violet — rotation-locus arcs (held off the chrome blue). |
| `--tl-green` | `#1f8a4c` | Green — the true-length result line (distinct from `--color-success`). |
| `--construct-ink` | `#5e564a` | Darker construct grey — small inline text. |
| `--locus-ink` | `#6a3fa3` | Darker locus violet — small inline text. |
| `--tl-green-ink` | `#166b3c` | Darker true-length green — small inline text. |

These are **Module-1-only** viewport encodings (§7). They are real tokens (so the engine's `readTokens`
and the page CSS share one source — no hard-coded hex), and they obey the Two-Cue Rule with their own
dash/label cues.

### 2.3 The named colour rules (binding everywhere)

**The Quiet Chrome Rule.** The blue accent covers at most ~10% of any screen. If more than a tenth of the
chrome is blue, it is overused: the eye must land on the viewport, not the UI.

**The Chrome-Only Blue Rule.** Blue belongs to the guidance layer (steps, actions, focus) and never appears
as a domain colour inside the viewport. The drawing uses the functional encodings (e.g. HP teal, VP amber).
This separation is non-negotiable: it lets a learner tell "the UI is guiding me" from "this is the domain
content," even on a washed-out projector.

**The Two-Cue Rule.** No colour carries meaning alone. Every functional encoding pairs its hue with a second
cue — line weight, dash pattern, label, icon, arrow direction, or shape. HP is teal **plus solid weight plus
an "HP" label**; VP is amber **plus dashed weight plus a "VP" label**; PP is violet **plus its "PP" label
plus its position** in the unfolded layout. Success is green **plus a check**. Disabled is faint **plus
reduced opacity plus a lock icon**.

---

## 3. Typography

**Body / UI font:** **Atkinson Hyperlegible** (fallback `system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", Roboto, sans-serif`), bundled as subset `woff2`.
**Numeric font:** **IBM Plex Mono** (fallback `ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono",
Consolas, "Liberation Mono", monospace`), bundled alongside.

These two are the **only** fonts loaded anywhere. **No external font CDN** (Google Fonts, Typekit, etc.) is
referenced in any module — confirmed by audit.

### 3.1 Where the fonts are hosted

Bundled `woff2`, loaded via `@font-face` with `font-display: swap`. Three faces only:
Atkinson Hyperlegible 400, Atkinson Hyperlegible 700, IBM Plex Mono 400. The files
(`atkinson-hyperlegible-latin-400-normal.woff2`, `…-700-normal.woff2`,
`ibm-plex-mono-latin-400-normal.woff2`) live in each module's **`assets/fonts/`** and are present in both.

- **Module 2:** `@font-face` is declared in `index.html`; URLs are `./assets/fonts/…` (the HTML is at the
  module root).
- **Module 1:** `@font-face` is declared in `src/shell.css`; because the stylesheet lives one level down in
  `src/`, its URLs are **`../assets/fonts/…`**. *(Module-specific path detail, §7 — not a violation.)*

### 3.2 When each font is used (hierarchy)

| Role | Font / weight | Size · line-height · tracking | Where |
|---|---|---|---|
| **Title** | Atkinson 700 | `1.35rem` · 1.2 · `-0.01em` | The step title — the tutor's headline for the current idea. |
| **Lead** | Atkinson 400 | `1.125rem` · 1.35 | The step's one-sentence explanation under the title. |
| **Body** | Atkinson 400 | `1rem` · 1.6 | Instructions, notes, hint copy. Comfortable measure; never below caption size. |
| **Label** | Atkinson 700 | `0.75rem` · 1.2 · `0.07em`, uppercase | Group titles (`.dock__group-title`) — the engineering-software register. |
| **Value** | IBM Plex Mono 400 | `0.875rem` · 1.2, tabular figures | Every live numeric readout with its unit, plus precise text entry. |
| **Step eyebrow** | IBM Plex Mono 400 | `0.75rem` · 1.2 · `0.07em`, uppercase | The "Step X of N" step indicator (`.card__eyebrow`), colour `--color-ink-secondary`. A **mono micro-label** — deliberately **not** the Atkinson-700 Label role. *(Split out from Label, code audit 2026-07-02: `.card__eyebrow` sets `font-family: var(--font-mono)` at the inherited 400 weight, with no `font-weight` override — not Atkinson 700.)* |

(These map to the code tokens `--text-title / --text-lead / --text-base / --text-xs / --text-sm`.)

### 3.3 The named type rules

**The Two-Weight Rule.** Atkinson ships Regular (400) and Bold (700) only. Build hierarchy from size and the
700 bold, never from a 500/600 weight that does not exist.

**The Tabular Rule.** Every value the math depends on is set in IBM Plex Mono with
`font-variant-numeric: tabular-nums`, so a value does not shift width as it updates. Showing real values in
real units is the line between an engineering instrument and a toy.

---

## 4. Spacing and layout principles

### 4.1 Spacing & radius scale (verified against code)

- **Spacing (4px base):** `--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px` ·
  `--space-5: 24px` · `--space-6: 32px`.
- **Radius:** `--radius-xs: 4px` (crisp control corners — checkbox, inputs) · `--radius-sm: 6px` (buttons) ·
  `--radius-md: 10px` (cards). Pills use `999px`.

Every surface is soft (generous radii, airy spacing) so nothing feels crowded, and every interactive target
is at least **44px**.

### 4.2 Elevation — flat by conviction

Engineering drawings are ink on a surface, so depth is conveyed by **tonal layering** (paper → panel →
solid-fill) and **1px hairline borders**, not by shadows. Rendered geometry never casts a shadow. Shadows
exist only as a thin exception for transient overlays that must float above the page.

- **Overlay shadow** (`--shadow-md` = `0 4px 16px color-mix(in srgb, var(--color-ink) 12%, transparent)`):
  warm-tinted, soft. Used only on transient surfaces that leave the flow — the term-definition popover, the
  orbit-hint chip, the mobile banner.
- **Focus halo** (`--ring-focus` = `0 0 0 3px color-mix(in srgb, var(--color-accent) 26%, transparent)`): a
  diffuse accent ring on focused/dragged controls, derived from the accent so it stays a single source.

**The Flat-Ink Rule.** Surfaces are flat at rest. Never cast a shadow on rendered geometry, and never use
elevation as decoration. If a shadow is not lifting a transient overlay off the page, it is wrong.

**The Border-Over-Shadow Rule.** Structure comes from a single crisp hairline (`#e0e1e5`), not a drop
shadow. Cards and panels are separated by tone and seam, not by float.

**The Host-Integration White Exception (retired 2026-07-09, Phase 1 Part 2).** Under the clinical
palette the separate `--color-host-white` token is **gone from the code**. Its former consumers now
split by role: **content surfaces** — the step card, `#active-problem` (statement + scaffolded
hints), `.problem-card`, the `.problem-library` problems page, and the `.compare-card` frame —
sit on pure white (`--color-paper` `#ffffff`), while **chrome chips** (wizard toggle, quick-view /
connector chips, `.vp-hint`/spotlights, restore chip) sit on the neutral-gray shell surface
(`--color-panel` `#f0f2f5`, which also paints the wizard/dock shell). A card keeps the standard
hairline so its seam reads crisp without a shadow (Border-Over-Shadow still holds — the white-on-gray
tonal jump carries the separation). Token discipline is unchanged: never use a bare `#fff`/`#000`
literal — always consume the token.

### 4.3 The z-index ladder

*(Promoted to a platform standard from `Module1/DESIGN.md` — added here from code audit 2026-06-27. The old
shared doc had no layering section; Module 2's `index.html` defines only the two rungs it needs.)*

A single ordered ladder so transient layers never fight. **Never hard-code a `z-index` — reference the
token.** The full ladder is defined in `Module1/src/shell.css :root`:

| Token | Value | What lives here |
|---|---|---|
| `--z-term` | 60 | Term-definition popover (`#term-pop`) |
| `--z-compare` | 90 | Compare-card frame (`#compare-card`) — Module 1 |
| `--z-notice` | 100 | Mobile notice banner (`#mobile-note`) |
| `--z-overlay` | 120 | Full-viewport modal — the Problem Library (`#problem-library`) |
| `--z-toast` | 130 | Success toast (`#sim-toast`) |
| `--z-restoring` | 150 | WebGL context-lost "Restoring 3D view…" chip (`#sim-context-lost`) |
| `--z-boot` | 200 | Boot diagnostic (`#boot-error`) — must sit above everything |

**Module 2** currently defines only `--z-notice: 100` and `--z-overlay: 120` (it has no Compare card, toast,
or context-lost chip in that form). The Compare canvas floats just above its own frame by a non-token
constant (`CARD_Z = 91`, its CSS2D label overlay `92`) — both below `--z-notice`, so the mobile banner and
page-level modals still escape over the card.

### 4.4 The no-transform invariant (Module 1, dual-mode)

`#sim-viewport`, `#canvas-area`, and `body` must stay **transform-free**. Module 1's Compare card floats its
`#c2d` canvas `position:fixed` from measured viewport rects; a CSS `transform` on any ancestor would
establish a containing block and break that placement. Treat these three elements as transform-free zones.
*(Module-1-specific; documented in full in `Module1/DESIGN.md`.)*

### 4.5 Wizard layout — the right-hand column (verified against code)

*(New section — added from code audit 2026-07-02, grounded in `Module2/index.html`.)*

The guided stepper lives in a **fixed-width vertical column pinned to the right**, beside the loud 3D
viewport on the left. This is the shared layout shape for every guided-stepper sim.

- **Split:** `body { display: flex; flex-direction: row }`. The **viewport** is the flexible left pane
  (`#sim-viewport { flex: 1 1 0; order: 1 }`); the **wizard** is the fixed right column
  (`#wizard { flex: 0 0 auto; width: clamp(340px, 34vw, 460px); height: 100%; order: 2; display: flex;
  flex-direction: column }`), separated by a single 1px `border-left` (`--color-border`) — a flat seam,
  no shadow (Border-Over-Shadow, §4.2).
- **Background mandate (strict):** the **3D viewport background is `var(--color-paper)` (`#ffffff`)** and
  the **wizard panel background is `var(--color-panel)` (`#f0f2f5`)** — one tonal step below paper. These
  are non-negotiable: never hard-code the hex, never swap the two tones, and never paint the viewport in
  the panel tone or vice-versa. (The step card sits on the same white panel surface; §4.4, §5.5.)
- **Wizard contents (module-scoped):**
  - **Module 2** (master): the column is the `#active-problem` header (shown only while a textbook problem
    is loaded) stacked **above** a `.wizard-main` row; that row is itself `flex-direction: row` with the
    step card (`#step-card`, left) beside the step rail (`#step-rail`, right). Module 2's wizard has **no**
    `.brand` wordmark and **no** `.chapnav` switcher.
  - **Module 1:** additionally carries the `.brand` wordmark and the `.chapnav` chapter switcher at the top
    of the column — these two classes are **Module-1-specific**, not part of the shared wizard shell.

---

## 5. Component standards

Every component consumes tokens, carries soft radii, meets a 44px target, shows a visible focus ring, and
pairs any colour signal with a second cue.

### 5.1 Buttons

- **Shape:** softly rounded (`6px`, `--radius-sm`), height at least 44px.
- **Typography:** `font: inherit` — buttons render in **Atkinson 400** (the body weight). **Never** bump a
  button to 700 or synthesize bold; button hierarchy comes from fill and colour, not weight (Two-Weight
  Rule, §3.3). *(Code audit 2026-07-02: `.btn { font: inherit }`, with no `font-weight` on `.btn`,
  `.btn--primary`, `.btn--ghost`, or `.btn--nav`.)*
- **Primary:** Technical Blue fill (`#1f66b5`) with paper text — the one loud action per step (Add, Next,
  Draw, Flatten). **Hover** deepens to `#17539b`.
- **Press / Active:** **`transform: scale(0.97)`**, easing back over `--dur-fast` — the one press language
  shared by every pressable control (primary, secondary, ghost, chip alike), always gated by
  `:not(:disabled)`.
  > **Updated from code audit 2026-06-27.** The former `DESIGN.shared.md` said "Active nudges down 1px
  > (transform only)." The actual code in **both** modules uses `transform: scale(0.97)` (e.g.
  > `Module2/index.html` `.btn:active`, `Module1/src/shell.css` `.btn--primary:active`). Module 2's own
  > `DESIGN.md` already said `scale(0.97)`; the shared copy had not been updated.
- **Secondary:** paper fill with a hairline border and ink text (Back).
- **Ghost:** text-only ink-secondary, transparent at rest (Reset, dismiss). Reset always routes through
  `window.simAPI.reset()`; there is no second reset path — and it is **guarded by an inline two-state
  confirm** ("Reset everything? · Yes / Cancel"): the first click arms the prompt and steps Back/Next
  aside, and only **Yes** fires the reset. A single-click wipe is forbidden (RULES.md §4.19).
- **Focus:** the accent focus halo, never removed.

### 5.2 Sliders

- **Track:** a thin 4px recessed groove in Track grey (`#e0e1e5`, = `--color-border`), pill-rounded; the travelled portion fills
  with the accent (WebKit via the `--p` custom property; Firefox via `::-moz-range-progress`).
- **Thumb:** a 16px accent knob with a 2px paper gap-ring and a hairline edge, flat at rest; the diffuse halo
  appears only on hover/focus/drag.
- **Hit area:** the full 44px row is draggable even though the track reads as a thin line.
- **Readout:** an IBM Plex Mono tabular value sits beside every slider with its unit; arrow keys step by 1,
  finer on Shift.

### 5.3 Inputs / fields

- **Numeric input:** IBM Plex Mono tabular, right-aligned, paper fill, hairline border, `4px` radius. Precise
  textbook entry; invalid text reverts to the last valid value, never an alarming red.
- **Select:** full-width, 44px tall, paper fill with a baked inline chevron, hairline border.

### 5.4 Toggles

- **Style:** a custom 18px drafting-square checkbox (not a consumer switch). Empty box versus a filled accent
  box with a paper tick is a shape cue, not colour alone.
- **Disabled by hierarchy:** reduced opacity with a small padlock icon at the row's end — reads as "locked
  for now," not broken. Use this pattern wherever a module needs mutually-exclusive control hierarchies (one
  mode disables another; e.g. Module 2's rotation hierarchy).

### 5.5 Cards / containers (panels)

- **Step card:** pure-white content surface (`--color-paper`) on the grey `--color-panel` wizard shell, `10px`
  (`--radius-md`) corners, hairline border, `24px/16px` padding. Holds only the current step's controls;
  content swaps with a short fade + translate (`panelIn`, `--dur-step` = 380ms).
- **Strategy:** no shadow (hairline border instead); cards are never nested.
- **Wizard shell:** the right-hand stepper panel (`--color-panel`; full layout in §4.5). In **Module 2**
  it holds the `#active-problem` header above a `.wizard-main` row (the step card beside the step rail).
  The `.brand` wordmark and `.chapnav` chapter switcher are **Module-1-specific** additions (§4.5), not
  present in Module 2's wizard.

### 5.6 Step rail (signature)

A vertical numbered spine of the wizard. **Completed** = a Success-green disc with a check glyph and
ink-secondary label; **Current** = a filled accent disc with a soft-accent halo and bold ink label;
**Upcoming** = a hollow, faint disc. The shape (filled / check / hollow) **plus the number** carries state
without relying on colour. A live region announces "Step X of N" on change. Learners may revisit any step up
to `maxReached`; upcoming steps stay disabled.

### 5.7 Inline term definition (signature)

First appearance of engineering vocabulary (HP, VP, orthographic projection, ground line — plus each
module's own terms) is a **dotted-underline accent button**. On hover, keyboard focus, or tap it reveals a
small accent-wash popover (`#e3ecf7`, ink text, `6px` radius, overlay shadow) defining the term in plain
language; screen readers get it via `aria-describedby`. The popover is `position: fixed` so it escapes the
card's scroll clip, flips above when there is no room below, and dismisses on Escape.

### 5.8 Hint callout

A persistent accent-wash box with a line info icon, for guidance that helps when a step might confuse. **Full
background tint, never a coloured side-stripe border.**

### 5.9 Viewport aids

- **Geometry / vertex label:** a small paper pill in IBM Plex Mono, nudged outward off the linework so it
  never sits on top of it.
- **Empty-state overlay:** a faint wireframe glyph with "Your drawing/solid will appear here" (adapt copy per
  module), shown until the first content is added. Quiet, no card, never blocks.
- **Orbit hint:** for 3D viewports, a one-time dismissible chip ("Drag to rotate the view") shown with the
  first content; auto-dismisses on the first view drag.

### 5.10 Motion palette & press conventions

CSS keyframes live in the stylesheet; JS-driven motion uses a small rAF tween system (`anim.js`) with a
**no-overshoot** named easing palette (`y1, y2 ∈ [0,1]`). **Everything collapses to instant under
`@media (prefers-reduced-motion: reduce)`** — the simulation still updates to its end state; only motion is
suppressed.

**Shared base motion tokens (both modules):** `--dur-fast: 150ms`, `--dur-base: 200ms`,
`--dur-step: 380ms`, `--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)`. *(Added from code audit — present in
code but not enumerated in the old shared doc.)*

**JS easing curves (Module 1, `src/anim.js`)** — verified against code, all match exactly:

| Curve | Bézier | Role |
|---|---|---|
| `easeStandard` | `0.22, 1, 0.36, 1` | Matches `--ease-standard` exactly; the tween **default** (so the clip-aware auto-zoom dolly uses it), and the `restorePerspective` ortho→perspective glide. |
| `easeFold` | `0.83, 0, 0.17, 1` | Symmetric "physical hinge" — the fold + held-angle dolly + ortho quick-view morph. |
| `easeCamera` | `0.76, 0, 0.24, 1` | Weighted accelerate-then-settle — the legacy quick-view snap + the legacy fold camera tween + the flat-view pan. |
| `easeDraw` | `0.25, 1, 0.5, 1` | Gentle ease-out — the projection draw-on ramp. |
| `easeDissolve` | `0.5, 0, 0.75, 0` | Accelerating ease-in (used as `1 − easeDissolve(t)`) — the 3D body dissolving into its flat drawing. |

**Key durations (Module 1, verified):** step-card swap `380ms` (`--dur-step`); projection draw-on `800ms`
(`easeDraw`); quick-view camera move `1500ms`; success toast hold `2600ms`; flow-note/spotlight hold `4500ms`
(240ms fade); cinematic fold `2800ms` (`FOLD_DURATION`, split `0.72`); **clip-aware auto-zoom dolly `500ms`
using `easeStandard`.**
  > **Updated from code audit 2026-06-27.** The former `Module1/DESIGN.md` claimed the auto-zoom was
  > "`AUTO_ZOOM_MS = 520ms (easeCamera)`." Code is `AUTO_ZOOM_MS = 500` (`engine.js:85`) and the dolly passes
  > no `ease`, so it uses the tween default `easeStandard` — not `easeCamera`. Both the duration and the curve
  > attribution were stale.

**Press & hover conventions.** Every pressable control shares the `scale(0.97)` press (§5.1). Every
hover-only rule is wrapped in `@media (hover:hover) and (pointer:fine){…}` so touch devices never get a stuck
hover after a tap; `:focus-visible` and `:active` rules stay **outside** the gate. A global
`:focus-visible { outline:none; box-shadow: var(--ring-focus) }` is the default and is never removed.

### 5.11 Scrollbars

Scroll containers show a **floating, padded scrollbar pill** — never a hidden scrollbar. A hidden bar
(`scrollbar-width: none`) fails *Visibility of System Status*: the learner gets no cue that content
continues below the fold. The pill is deliberately quiet (Quiet Chrome, §2.3) but present.

- **Shape:** the WebKit channel is **10px**, but the thumb carries a **3px transparent border +
  `background-clip: padding-box`**, so only the inner **~4px** paints and the pill floats 3px clear of
  both edges (the container's paper shows through the border). `border-radius: 999px`; **transparent
  track; no native arrow buttons.**
- **Tint:** thumb is **`--color-border`** (`#e0e1e5`, ~1.31:1 on the card paper — faintly visible). Read
  the token, never hard-code (§6.2). *`--color-panel` (~1.12:1) is too invisible; `--color-bench-grey` is
  too loud — both were tried and rejected (ADR-032).*
- **Firefox:** `scrollbar-width: thin` + `scrollbar-color: var(--color-border) transparent`, scoped to an
  **`@supports (-moz-appearance: none)`** guard (the padding-box floating trick has no Firefox equivalent).
- **⚠️ Load-bearing gotcha:** leave `scrollbar-width` **UNSET on the base rule.** Declaring it
  unconditionally makes **Chrome 121+** disable the `::-webkit-scrollbar` pseudo-elements and fall back to
  its native ~11px bar with arrow buttons — the floating pill is lost. That is why `scrollbar-width` is set
  **only** inside the Firefox `@supports` block.

```css
/* Canonical pattern (swap SELECTOR; see ADR-032). */
SELECTOR::-webkit-scrollbar { width: 10px; }
SELECTOR::-webkit-scrollbar-track { background: transparent; }
SELECTOR::-webkit-scrollbar-thumb {
  background: var(--color-border);
  background-clip: padding-box;
  border: 3px solid transparent;
  border-radius: 999px;
}
@supports (-moz-appearance: none) {
  SELECTOR { scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
}
```

**Applied in:** `graphics_module_1_topic_1_foundations` (`.card__scroll`); Module 2 master (`Module2/`:
`#step-card`, `.problem-library__body`); intro topic (`graphics_module_2_topic_1_introduction/`:
`#shape-rail`, `#anatomy-panel`).

### 5.12 Wizard-collapse toggle (`.wizard-toggle`, signature)

*(New section — added from the `template_starter/` sync audit, 2026-07-16, grounded in
`Module2/index.html`.)* A single 44px chevron chip pinned to the viewport's **top-right** corner,
collapsing the whole wizard column out of the layout so the viewport can go full-width.

- **Position (load-bearing):** `top: var(--space-3); right: var(--space-3)` — the standard
  top-corner inset, **not** the `.vp-cluster` top-left clearance (`calc(44px + var(--space-5))`).
  The two look similar but solve different problems: `.vp-cluster` sits one button-height down
  because it stacks *below* the top-left quick-view chips; `.wizard-toggle` has no button above it
  on the top-right, so it belongs at the plain `--space-3` inset. **Do not copy the `.vp-cluster`
  offset onto this control** — that was a shipped regression (fixed 2026-07-16) that also silently
  collided with the compact Compare card, whose own top (`calc(var(--space-3) + 44px +
  var(--space-2))`) is derived *assuming* the toggle sits at the shallow `--space-3` inset.
- **Shape:** 44px square, `--color-panel` fill, hairline border, `--radius-sm` corners, a centred
  20px chevron icon.
- **Press/hover/focus:** `scale(0.97)` on `:active` (§5.1's shared press language); hover deepens to
  paper fill + bench-grey border under the standard `(hover:hover) and (pointer:fine)` gate; the
  accent focus halo, never removed.
- **State:** `body.wizard-collapsed` drops `#wizard` out of the flex row (`display:none`) and
  rotates the chevron 180° to point back toward where the panel will reappear.

### 5.13 Compare-split 50/50 workbench (ADR-037, signature)

*(New section — added from the `template_starter/` sync audit, 2026-07-16. Corrects §7/§8's former
"Compare is Module-1-only" claim — see below.)* The on-demand dual-mode "workbench": `body` flips
from the wizard-beside-viewport flex row into a CSS grid —

```
"view compare"   (minmax(0,1fr) row, two 1fr columns)
"rail  rail"      (auto row spanning both panes)
```

— gated by `body.compare-split`. This is the shared dual-mode shape for every guided-stepper sim
that offers a 2D/3D or before/after comparison, not a per-module style choice.

- **Shell tone:** the split's own background is `--color-panel` (the gray working surface, one
  tonal step below paper), with `gap`/`padding: var(--space-4)` between the three panes — the
  panes read as **three floating rounded cards** on that gray surface, not flush edge-to-edge
  regions.
- **The three panes:** the 3D viewport (`grid-area: view`), the 2D drawing/compare card
  (`grid-area: compare`), and the docked control rail (`grid-area: rail`). Each gets a hairline
  border + `--radius-md` corners; the viewport additionally clips its canvas with
  `overflow: hidden`. No shadow on any of the three (Flat-Ink, §4.2 — docked surfaces don't earn
  the transient-overlay shadow).
- **`#workbench-rail`:** a paper-white rounded card (matching the other two panes) hosting whatever
  drivers the module re-parents into it on entering the split. **The rail's internal control
  layout is module-scoped** — how many drivers, and whether they flow as a simple row or a tuned
  multi-column grid, depends on that module's own control count; only the card chrome (tone,
  border, radius, padding) is the shared, platform-level part.
- **`#rail-toggle` (Hide/Show):** a dedicated 44px pill, independent of `.wizard-toggle`, that
  floats at the 3D pane's bottom-left corner (`grid-area: view; align-self:end; justify-self:start`)
  so it never intrudes into the rail's own grid. `body.rail-collapsed` reclaims the rail's row
  (`#workbench-rail { display:none }`) and flips the toggle's chevron 180°; the split's
  `grid-template-rows`/`grid-template-areas` collapse to a single `view compare` row.
- **Exit:** while split, the 2D pane's own head chrome and `.wizard-toggle` are redundant
  (`display:none`) — the still-visible, pressed Compare chip in the 3D pane is the single way back
  out of the split.

---

## 6. Cross-module consistency rules (must be identical everywhere)

These are binding in every module and every deployed topic copy. **This file is the single source; where a
module appendix conflicts on a token or named rule, this file wins.**

1. **Tokens are identical.** Every shared `--color-*`, `--space-*`, `--radius-*`, `--font-*`, `--dur-*`,
   `--ease-*` token has the exact value in §2–§5. Verified: `Module1/src/shell.css` and
   `Module2/index.html` agree on all shared tokens. A module may **add** tokens (§7) but must never
   **re-define** a shared one to a new value.
2. **Read colours at runtime, never hard-code hex.** JS and Three.js materials read the live token via
   `getComputedStyle(document.documentElement).getPropertyValue('--token').trim()` (Module 2) or the engine's
   `readTokens()` → `COL` map (Module 1). *(ADR-003.)* The audit found **zero** hard-coded colour hex in any
   `src/` JS in either module. The single deliberate exception is Module 1's pre-CSS boot diagnostic (§7/§8).
3. **The named rules are binding:** Quiet Chrome, Chrome-Only Blue, Two-Cue (§2.3); Two-Weight, Tabular
   (§3.3); Flat-Ink, Border-Over-Shadow, Host-Integration White Exception (§4.2).
4. **44px minimum target** with a visible accent focus halo on every interactive control.
5. **`prefers-reduced-motion` collapses all motion to instant**, but state still updates to the end value.
6. **One press language:** `transform: scale(0.97)` on `:active` for every pressable control (§5.1).
7. **The guided-stepper model** (one idea per step, controls revealed only when their step needs them, the
   vertical numbered rail, "Step X of N" live region) is the shared interaction shape.

### 6.1 Do's and Don'ts

**Do:**
- Keep the blue accent to ~10% of the chrome and let the viewport be the loud subject.
- Keep blue in the chrome only; viewport meaning uses the domain encodings (HP teal `#007f7c`, VP amber
  `#bc5d1e`, PP violet `#7a5ea6`).
- Pair every colour signal with a second cue (dash, weight, label, icon, arrow, shape).
- Read every colour from a CSS custom property; JS/Three.js read the live token, never a hard-coded hex.
- Convey depth with tonal layering (paper → panel → solid-fill) and 1px hairlines.
- Keep every interactive target ≥ 44px with a visible accent focus halo.
- Build type hierarchy from size and the 700 bold; set all numerics in IBM Plex Mono tabular.
- Collapse all motion to instant under `prefers-reduced-motion`; the simulation still updates.

**Don't:**
- Put blue linework inside the viewport, or let a functional encoding read as the chrome accent.
- Use gamified edtech devices: no mascots, confetti, badges, streaks, points, or cartoon geometry.
- Drift glossy or architectural-viz: no glassmorphism, PBR renders, soft consumer gradients, or
  drop-shadow-heavy cards.
- Reach for marketing-site polish: no gradient text, `background-clip: text`, hero imagery, or parallax.
- Default to dark IDE chrome or expose every control at once (the overwhelming dashboard the stepper replaces).
- Use `border-left`/`border-right` greater than 1px as a coloured accent stripe; use a full background tint
  or a leading icon.
- Cast a shadow on rendered geometry, or use a shadow anywhere except a transient floating overlay.
- Use a bare `#000` or `#fff` literal (always consume the token — `--color-paper` is the white surface,
  `--color-panel` the grey shell, §4.2), a 500/600 font weight, or colour as the only signal.

---

## 7. Module-specific exceptions (what each module is allowed to differ on)

A module adds its own domain encodings and viewport behaviour **here**, never by re-defining a shared token.

### 7.1 Module 2 — Orthographic Projection of Solids (the master / reference implementation)

- **Adds PP Violet** (`--color-pp-line #7a5ea6`) as a fully-used third projection plane (side view).
- Defines only the two z-index rungs it uses (`--z-notice`, `--z-overlay`).
- **Ships the ADR-037 Compare-split 50/50 workbench** (§5.13) — the on-demand 2D/3D dual-mode
  split, including the `#rail-toggle` Hide/Show control. *(Landed 2026-07-16; supersedes the
  former "Module 1 only" note that used to live here and in §8.5 below — see §7.2's note.)*
- Step card is addressed by **id** (`#step-card`); the pure-white content surface (`--color-paper`,
  formerly `--color-host-white` — retired, §4.2) applies to `#step-card`, `#active-problem`,
  `.problem-card`, and the `.problem-library` backdrop; the `.vp-hint`/spotlight chips sit on the
  grey `--color-panel` chrome surface.
- `@font-face` URLs are `./assets/fonts/…` (HTML at module root). UI DOM ownership: `uiManager.js` owns the
  parameter dock.
- Pressable chips/toggles all use `scale(0.97)` (`.wizard-toggle:active`, `.quick-view:active`,
  `.connector-toggle:active`, `.btn:active`, etc.).

### 7.2 Module 1 — Foundations of Projection (seven lessons + Points/Lines sims)

- **Adds the full z-index ladder** (§4.3) and the **Lines construction-aid tokens** (§2.2:
  `--construct`/`--locus`/`--tl-green` + `-ink` variants).
- **Carries a premium interaction layer** (motion palette, engine-injected viewport chrome, onboarding,
  feedback/resilience, Problem Library). The design-system parts are in §4–§5; the deep implementation spec
  (Compare-View state machine, cinematic-fold camera, chrome-injection contract) lives in `Module1/DESIGN.md`.
- **The Compare View / Compare card** re-houses the old dual-renderer 2D drawing as an on-demand
  floating card, with the ADR-037 50/50 split (§5.13) as its expanded state. **Updated
  2026-07-16:** this is no longer Module-1-only — Module 2 (the master) now ships the same
  Compare-split workbench, and `template_starter/` carries it pre-injected for every new module.
  Module 1 keeps the deeper **Compare-View state-machine spec** (the cinematic-fold camera
  orchestration, chrome-injection contract) as its own implementation detail in
  `Module1/DESIGN.md` — that part remains Module-1-specific; the visual shell in §5.13 is shared.
  The pure-white content surface (`--color-paper`, formerly `--color-host-white` — retired,
  §4.2) in Module 1 additionally covers the viewport `.compare-card`
  frame, with the Compare drawing **stage** also `--color-paper` so the 2D sheet matches the player. Step
  card is addressed by **class** (`.step-card`), and the surface applies to `.step-card`, `#active-problem`,
  `.problem-card`, the `.problem-library` backdrop, and the `.compare-card` frame; `.vp-hint`/spotlight
  chips sit on the grey `--color-panel` chrome surface.
- `@font-face` is declared in `src/shell.css`, so font URLs are **`../assets/fonts/…`** (stylesheet one level
  down). UI DOM ownership: the engine + `chrome.js` own the chrome; `src/uiManager.js` is a vestigial stub.
- **The no-transform invariant** (§4.4) is required by the Compare card's `position:fixed` placement.

---

## 8. Known gaps and open questions (flagged during the 2026-06-27 audit)

1. **`solid-fill` is canonical; `geometry-fill` was never implemented.** The former `DESIGN.shared.md` named
   the rendered-geometry fill token `geometry-fill` (`#e7e1d4`); the actual CSS variable in **both** modules
   is `--color-solid-fill`. **Resolved: code wins — the token is `--color-solid-fill`.** *Open question:* if
   the platform later wants a discipline-neutral name for non-solids modules, that is a real **rename in
   code** (both modules + topic copies) tracked through an ADR — not a doc-only change. Until then, do not
   write `--color-geometry-fill` anywhere.
2. **`--color-pp-line` is defined-but-unused in Module 1.** It is carried over from Module 2 but Module 1's
   colour convention only uses HP/VP. Harmless (it keeps the token set uniform), but a contributor should not
   assume Module 1 renders a profile-plane projection. *Open: remove it from Module 1, or wire it up if/when
   Module 1 gains a side view.*
3. **The z-index ladder and base motion tokens were only fully present in Module 1.** They are now documented
   as platform standards (§4.3, §5.10), but **Module 2's code defines only the two z rungs it needs.** Open:
   decide whether Module 2 should adopt the full ladder for forward parity.
4. **Module 1's boot diagnostic hard-codes hex** (`#efebe1`, `#221f18`, `#d9d2c3`, `#faf8f3`, `#564e3c`) in an
   inline `<script>` in `index.html`. This is a **deliberate pre-CSS fallback** — the error overlay must paint
   before `shell.css`/tokens load, so it cannot use `var(--color-*)`. It is the **only** hard-coded colour
   anywhere and is exempt from ADR-003 by necessity. Module 2's `index.html` has no such literals.
5. **RESOLVED 2026-07-16 — the Compare drawing feature has been ported to Module 2.** The ADR-037
   50/50 workbench (§5.13) now ships in the master and in `template_starter/`; this is no longer an
   open gap. (Historical note: as of the 2026-06-27 audit this item read "still Module-1-only, not
   yet ported to Module 2" — that has since happened; §7.1/§7.2 updated to match.)
6. **Per-module `DESIGN.md` files remain on disk.** `Module1/DESIGN.md` is kept as the legitimate Module-1
   premium-interaction implementation appendix. `Module2/DESIGN.md` is now fully superseded by this root file
   and is a candidate for removal (left in place because the consolidation brief only authorized deleting the
   `DESIGN.shared.md` copies).

---

*Consolidated at the Simatrix root on 2026-06-27 from `Module1/DESIGN.md`, `Module1/DESIGN.shared.md`,
`Module2/DESIGN.md`, and `Module2/DESIGN.shared.md`, audited against the live code. Module 2 is the master;
where a module appendix conflicts on a token or named rule, this file wins. Enforcement: `../RULES.md` ·
Reasoning: `../DECISIONS.md` · Architecture: `../ARCHITECTURE.md`.*
