# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.1: Basic Constructions

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-078]**, distinct from this repo's original
> (KTU B.Tech) Engineering Graphics syllabus. This is that track's first module and first topic.
> Namespaced `graphics_diploma_module_1_topic_1_<N>_<slug>` to avoid colliding with the existing
> `graphics_module_1_topic_*` folders, which belong to the original syllabus's own Module 1
> (foundations of projection — planes, line types, dimensioning, quadrants, first-angle, points,
> lines). **Do not confuse the two Module 1s or port content between them without a reason.**

Nine fundamental plane-geometry constructions, taught one at a time: bisecting a line, bisecting
an arc, two perpendicular constructions (from a point on / not on a line), bisecting an angle,
transferring an angle, building a triangle from its three sides, building a square from one side,
and dividing a line into *n* equal parts. This is the reference scaffold for the rest of this
syllabus track's Module 1 topics (1.2–1.6) — they duplicate this folder and swap the construction
set (RULES.md §1.4's manual-copy discipline, no shared library).

## Project-wide documentation (read before cross-module tasks)

Per **ADR-078**, this syllabus track **shares this repo's root docs and ADR sequence** — it is
**not** a Case-C fork (MODULE-STARTER.md §5.4's "own local DECISIONS.md at ADR-001" does not
apply here). Before starting any task that touches shared behavior, UI patterns, or cross-module
consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — why key decisions were made (ADR log; this topic's own decisions are
  recorded there under ADR-078 and any later ADRs, not a local file)
- `../RULES.md`        — what you must and must not do (enforcement)
- `../DESIGN.md`       — color tokens, typography, component standards
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** every colour, spacing, and type value is a token from `../DESIGN.md` —
never hard-code a hex or a raw pixel/rem literal (RULES.md §4.1). This topic's own construction-line
colour tokens are declared in this folder's `DESIGN.md` appendix (§2.2 pattern, RULES.md §1.14/§4.16
— never redefining a shared root token). Strategic context (persona, principles, accessibility
commitments) lives in the root `../PRODUCT.md`.

**Scope boundary:** this module produces a self-contained simulation payload — the 2D viewport
plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The host
Simatrix website (navbar, module browser, account UI, marketing chrome, login) is out of scope.

---

## Architecture — 2D SVG orchestrator (ADR-078, invoked-by ADR-025)

Per **ADR-078**, this topic reuses the *discipline* of Module 2's orchestrator pattern (ADR-007) —
one orchestrator owning state and a single `rebuild()` funnel, single-purpose leaf modules that
never import each other — but the render target is **inline SVG, not Three.js**. No prior ADR
tested this substrate; the following are this topic's own re-expressions, not literal ports:

- **No Three.js, no import map.** This topic loads no CDN module at all — the platform's
  no-runtime-network-call constraint (RULES §2.12) is satisfied trivially since there is nothing
  to fetch beyond the page itself and the bundled fonts.
- **`src/main.js`** is the orchestrator: owns `state` (which construction is active + its given
  parameters + how much of the construction has been revealed), the single `rebuild()` pipeline,
  `window.simAPI`, and the boot watchdog. `rebuild()`'s shape: `dispose previous construction's SVG
  children → resolve the active construction's given parameters → compute construction geometry as
  plain data (constructions.js) → render/animate it into the SVG (renderConstruction.js) → place
  labels → notify (drives step-gating + the Problem Library self-check)`.
- **`src/constructions.js`** — pure geometry, no DOM: one entry per construction, each a
  `build(params) → recipe` function producing an ordered list of draw operations (a given line/
  angle/arc, then each compass-arc / straightedge move as its own step, then the result). Circle
  circle and line line intersection are the only two primitives every construction is built from.
- **`src/renderConstruction.js`** — the only file that touches the SVG DOM for construction
  content: draws a recipe's steps into `#construction-layer`, one at a time, with a draw-on
  animation (stroke-dashoffset for lines/arcs) that collapses to instant under
  `prefers-reduced-motion` (same discipline as `anim.js`, DESIGN.md §5.10).
- **Disposal, re-expressed for SVG:** every `rebuild()` clears `#construction-layer`'s children
  before redrawing (RULES §3.3's "run the disposal contract at the start of every rebuild",
  re-expressed for DOM nodes instead of Three.js geometry/materials — there is nothing to
  `dispose()` in the WebGL sense).
- Leaf modules copied near-verbatim from the platform (renderer-agnostic, confirmed by reading
  `template_starter/src/`): `anim.js` (tween engine), `stepper.js` (guided-step controller,
  adapted for a picker-driven step 1), `terms.js` (inline glossary), `onboarding.js` (first-run
  hints). `uiManager.js` and `problemLibrary.js` are adapted, not copied — their DOM/data pattern
  carries over, their 3D-slider specifics do not.

## The four-step shape (every construction uses the same shape)

Per PRODUCT.md's Orient → Intuition → Problem-solving arc, all nine constructions share one
step sequence rather than being crammed into a single wall-of-controls wizard:

1. **Choose** — a 9-item picker (Orient: one screen, one decision).
2. **Given** — the construction's starting element(s) on screen, tied to a live numeric parameter
   (length in mm / angle in degrees / n).
3. **Construct** — the compass-arc and straightedge moves animate in, in order, replayable.
4. **Verify** — the finished construction's result value, and (for the constructions the Problem
   Library exercises) a route into a textbook-style problem.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11).
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_1_1_basic_constructions/
├── index.html              ← SVG viewport + wizard shell, platform CSS tokens inline, no import map
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: this topic's construction-line color tokens
                                  (no local assets/fonts/ — fonts load from the shared platform host, ADR-082)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy — renderer-agnostic)
    ├── stepper.js                   ← guided-step controller (4-step shape + picker step)
    ├── terms.js                       ← inline glossary popovers
    ├── onboarding.js                    ← first-run hints
    ├── uiManager.js                       ← construction parameter dock (given-value sliders)
    ├── problems.js                          ← Problem Library data (tiered)
    ├── problemLibrary.js                      ← Problem Library modal + self-check
    ├── constructions.js                         ← the 9 constructions' pure geometry
    ├── renderConstruction.js                      ← draws a construction recipe into the SVG
    └── main.js                                      ← orchestrator
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; ES module imports with explicit `.js`, relative paths only (ADR-001, RULES §2).
- Single `rebuild()` is the only path for a construction to change; controls never touch the SVG
  directly (RULES §3.2, re-expressed for this substrate).
- Read all colours from CSS tokens — never hard-code hex (ADR-003).
- Problem Library: tiered, hints revealed one at a time, tolerant self-check that never auto-fills
  (ADR-015, RULES §6.1–§6.3).
- A leaf module must not import a sibling leaf — only hang off `main.js` (ADR-007, RULES §3.6).

---

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 1.1 — Basic Constructions ·
2D SVG orchestrator (ADR-078) · reference scaffold for Topics 1.2–1.6 · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
