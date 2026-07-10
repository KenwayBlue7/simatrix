# CLAUDE.md — Simatrix Engineering Graphics · Module 1

Module 1 of the Simatrix Engineering Graphics platform. It ships **seven pages**, and every one
is now a **live 3D guided-stepper lesson** built on a single shared frame. Five **intro lessons**
teach the foundations of technical drawing (the reference planes, types of lines, dimensioning,
the four quadrants, first-angle projection), and **two simulations** teach **projection of
points** and **projection of straight lines** onto the Horizontal Plane (HP) and Vertical Plane
(VP) across all four dihedral quadrants. Follows **First Angle Projection** (Indian standard,
SP 46:2003 / BIS). Ships as a self-contained folder that runs via XAMPP
(`http://localhost/Simatrix/Module1/`) or any static HTTP server.

## Project-wide documentation (read before cross-module tasks)
Before starting any task that touches shared behavior, UI patterns,
or cross-module consistency, read these root-level files:
- ../ARCHITECTURE.md  — system map, component breakdown, data flow
- ../DECISIONS.md     — why key decisions were made (ADR log)
- ../RULES.md         — what you must and must not do (enforcement)
- ../DESIGN.md        — color tokens, typography, component standards
- ../PRODUCT.md       — who it's for, features, accessibility commitments

For module-specific work that doesn't touch shared behavior,
reading the root docs is optional but recommended.

**Intro lessons (single 3D window — `mode:'single'`):**
- **`index.html` + `intro.js`** — Lesson 1: **The two reference planes** (the module entry page).
  A live orbitable 3D scene of the teal HP + amber VP meeting at the xy fold line.
- **`linetypes.html` + `linetypes.js`** — Lesson 2: **Types of lines** on a machine part.
- **`dimensioning.html` + `dimensioning.js`** — Lesson 3: **Dimensioning** (same machine part).
- **`quadrants.html` + `quadrants.js`** — Lesson 4: **The four quadrants**.
- **`firstangle.html` + `firstangle.js`** — Lesson 5: **First-angle projection & the fold**.

**Simulations (3D main pane + on-demand Compare card — `mode:'dual'`):**
- **`points.html` + `main.js`** — the **Projection of Points** sim.
- **`lines.html` + `lines.js`** — the **Projection of Straight Lines** sim.

All seven pages share one engine + one stylesheet: **`src/engine.js`** (the `initSim()` 3D +
stepper engine) and **`src/shell.css`** (the chrome). Each page is **thin** — an HTML shell that
links `shell.css` plus a small orchestrator `*.js` that imports `engine.js`, supplies its own
pure data + draw functions, and calls `initSim({…})`. Real logic lives only in the shared frame,
so the pages **no longer drift** — a shell or engine change lands once.

The two intentional Module-1 sim features carried by the engine are (1) the **Compare View** — a
single always-3D main pane (`#c3d`) with the 2D drawing (or, while folded, a live 3D view) shown
on demand in a floating Compare card (it re-houses the old dual-renderer second view) — and (2)
the **cinematic reversible fold/rabatment animation** (Points, Lines, and the First-angle lesson):
the sheet folds flat, reversing on demand. For the two sims (Points/Lines) the fold **holds the
learner's 3D angle** — the perspective camera never rotates, it only dollies+pans along the fixed
view direction to keep the flattening sheet framed, so students watch the HP plane hinge flat into
the 2D drawing (the clean head-on orthographic read stays in the Compare card). The First-angle intro
lesson keeps the simpler single-perspective sweep square-on. (See the dual-camera orchestrator below,
which still serves the orthographic quick-views.) On top of that
the module carries a full **premium interaction layer** ported from Module 2 (motion palette,
engine-injected viewport chrome, onboarding, feedback/resilience, and the Problem Library); that
layer is specified in `@DESIGN.md`. The module was harmonized to Module 2's design language
(shared tokens, bundled fonts, `#wizard` / `#sim-viewport` shell, vertical numbered rail).

**UI model:** a **Guided Stepper** (progressive disclosure, one idea per step) — not an
all-controls-at-once dock. A step rail walks the learner through a lesson; each step reveals only
the controls it needs.

**Design system rules:** Follow the consolidated platform design system at `../DESIGN.md` (Simatrix
root) for all platform-wide colour, typography, spacing, and base-motion decisions; the
**module-local** premium-interaction *implementation* spec (Compare View contract, cinematic-fold
camera, z-index ladder, chrome-injection contract, motion palette) is `@DESIGN.md`; strategic
context — users, brand personality, anti-references, design principles, accessibility commitments —
lives in the consolidated root `../PRODUCT.md` (the single platform-wide product contract; ADR-023).
Tokens are the canonical Module 2
`--color-*` / `--space-*` / `--radius-*` / `--z-*` / motion vocabulary, defined once in
`src/shell.css`'s `:root {}`. **Never hard-code hex values** in CSS or JS. The engine reads the
live colour tokens at runtime via `getComputedStyle` (`readTokens()` in `src/engine.js`) into the
exported `COL` map, so the viewport and the chrome always share one source of truth. A lesson that
needs an extra token passes `tokens:{ key:'--css-var' }` to `initSim` and the engine adds it to
`COL`. For cross-module quality/aesthetic parity (the host-white card exception, the
"Practice problems" ghost-entry spec, step-counter weight, projection-foot marker style
(thick filled dot), quadrant-neutral distance labels) plus a pre-ship checklist, see
`../RULES.md` (platform-wide standards & parity checklist at the Simatrix root).

---

## Architecture (non-negotiable)

- **No build step.** No npm, Vite, Webpack, bundler, or `package.json`. Files run by opening
  a page via a local HTTP server (XAMPP `htdocs/`). Direct `file://` opening fails due to ES
  module CORS restrictions in Chrome.

- **CDN ES modules only**, via this exact import map pinned to `0.160.0`:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }}
  </script>
  ```
  Never use `@latest`. Never `npm install three`. Never use the UMD global build.
  (The engine uses three addons `OrbitControls`, `Line2`/`LineGeometry`/`LineMaterial`, and
  `CSS2DRenderer`/`CSS2DObject` — all from this same pinned CDN.)

- **Imports must include `.js` extension** — `import { x } from './src/pointData.js'`.
  Extensionless imports 404 without a bundler.

- **All paths relative** — `./src/pointData.js`, never `/src/...`. The folder may be served
  from any URL prefix.

- **Fonts are bundled woff2** in `assets/fonts/` (Atkinson Hyperlegible 400/700, IBM Plex
  Mono 400), loaded via `@font-face` in `src/shell.css` — no Google-Fonts CDN. Because the
  stylesheet lives in `src/`, its font URLs are `../assets/fonts/…` (one level up). The pages
  work offline after the first Three.js CDN fetch is cached.

- **Requires internet on first load** for the Three.js CDN fetch. Once cached by the browser
  it works offline.

---

## File structure

All seven pages are thin HTML shells; each pairs with a small orchestrator `*.js` that calls
`initSim()`. The shared frame (`src/engine.js` + `src/shell.css`) holds all real logic. The
premium interaction layer adds five small leaf modules (`anim`, `chrome`, `onboarding`,
`problemLibrary`, and the two `*Problems` data files) imported by the engine.

```
Module1/
├── index.html          ← Lesson 1 shell: The two reference planes (module entry) — single mode
├── intro.js            ← Lesson 1 orchestrator (planes; one draw3D)
├── linetypes.html      ← Lesson 2 shell: Types of lines — single mode
├── linetypes.js        ← Lesson 2 orchestrator (machine part; cumulative line-type reveal)
├── dimensioning.html   ← Lesson 3 shell: Dimensioning — single mode
├── dimensioning.js     ← Lesson 3 orchestrator (machine part; aligned⇄uni + mini-challenge)
├── quadrants.html      ← Lesson 4 shell: The four quadrants — single mode
├── quadrants.js        ← Lesson 4 orchestrator (rail-driven quadrant per step; reuses pointData)
├── firstangle.html     ← Lesson 5 shell: First-angle projection & the fold — single mode
├── firstangle.js       ← Lesson 5 orchestrator (fixed Q1 point; cinematic fold + first-angle symbol)
├── points.html         ← Projection of Points sim shell — dual mode (3D main pane + Compare card)
├── main.js             ← Points orchestrator (resolve, draw3D/draw2D, fold scene, controls,
│                         Compare gate, quick views, connector toggle, problems, recovery notes)
├── lines.html          ← Projection of Straight Lines sim shell — dual mode
├── lines.js            ← Lines orchestrator (draw3D/draw2D, fold scene, Traces / True-Length
│                         constructions into the Compare card, problems, recovery notes)
├── meta.json           ← Simatrix platform metadata (title, description, difficulty, tags)
├── CLAUDE.md           ← this file (architecture & conventions)
├── DESIGN.md           ← module-local premium-interaction spec (Compare View, fold camera, z ladder, chrome, motion)
├── Module 1 Premium Upgrade.md ← the increment-by-increment upgrade plan (historical record)
├── assets/
│   └── fonts/          ← bundled woff2 (Atkinson Hyperlegible 400/700, IBM Plex Mono 400)
└── src/
    ├── engine.js       ← SHARED 3D + stepper engine: initSim(config) + the helper toolkit + live COL
    ├── shell.css       ← SHARED chrome: :root tokens, @font-face, #wizard/#sim-viewport shell, rail, controls, premium CSS
    ├── anim.js         ← leaf: rAF tween system + the named easing palette (ticked by the engine loop)
    ├── chrome.js       ← leaf: injects the shared viewport / step-card / Problem-Library chrome (no 7-way HTML drift)
    ├── onboarding.js   ← leaf: first-run orbit hint v2 + queued contextual spotlights + ad-hoc cues
    ├── problemLibrary.js← leaf: config-driven Problem Library controller (serves both sims)
    ├── pointProblems.js← pure data: the Points problem set (PROBLEMS / TIERS / FIELD_LABELS)
    ├── lineProblems.js ← pure data: the Lines problem set (PROBLEMS / TIERS / FIELD_LABELS)
    ├── pointData.js    ← pure data: defaultPointData(), resolvePosition() (reused by Points/quadrants/firstangle)
    ├── steps.js        ← pure data: STEPS (Points sequence) + TERMS (inline glossary)
    ├── planeData.js    ← pure data: defaultPlaneData() (Lesson 1)
    ├── planeSteps.js   ← pure data: STEPS + TERMS for Lesson 1 (the two reference planes)
    ├── linetypeSteps.js← pure data: STEPS + TERMS for Lesson 2 (types of lines)
    ├── dimSteps.js     ← pure data: STEPS + TERMS for Lesson 3 (dimensioning)
    ├── quadrantSteps.js← pure data: STEPS + TERMS for Lesson 4 (one quadrant per step)
    ├── firstangleSteps.js← pure data: STEPS + TERMS for Lesson 5 (first-angle & the fold)
    ├── partData.js     ← shared MACHINE PART: MACHINE_PART + drawPart()/drawDim() (Lessons 2 & 3)
    ├── lineData.js     ← pure data layer for the Lines sim
    ├── lineSteps.js    ← pure data layer: the Lines step sequence + terms
    └── uiManager.js    ← vestigial stub (kept for import compatibility; the engine handles UI)
```

---

## Platform contract

- **`meta.json`** at root with all four fields: `title`, `description`, `difficulty`, `tags`.
  It covers the whole module — the five intro lessons plus the Points & Lines sims.
- **`window.simAPI`** wired by the engine (`src/engine.js`) for every page:
  ```js
  window.simAPI = {
    pause(),   // cancel the rAF loop → tweens FREEZE (not cancel)
    resume(),  // restart the rAF loop (tweens continue smoothly)
    reset(),   // restore default data + cameras; close Compare, drop fold/connector overrides; rebuild
  };
  ```
- **Self-starting.** The engine boots on the `window load` event; no external `init()` call.
- **Mobile notice.** A dismissible banner (`#mobile-note`) appears at viewports `< 768px`.

---

## The shared frame (`src/engine.js` + `src/shell.css`)

The single source of truth for every page. The generic machinery was lifted out of the old
copy-pasted `main.js`/`lines.js` so the shells can no longer drift.

**`src/engine.js`** owns: the renderer stack(s) + JS-controlled canvas sizing
(`build`/`layout`/`loop`/`s3Px`/`s2Px`/`updateLineRes`), the guided stepper
(`buildRail`/`renderStep`/Back-Next-jump/progressive disclosure/`#live`), term popovers, the
**Compare View** state machine (`compare = {show,hide,toggle,isOpen}` + `refillCompare`), the
**cinematic reversible-fold** timeline driver (camera + sheet), the boot-time **chrome injection**
+ wiring, **onboarding** (orbit hint + spotlights, via `onboarding.js`), the **feedback/resilience**
layer (success toast, inline Reset confirm, per-step done-badge, WebGL context-loss recovery), the
per-frame **tween tick** (drives `anim.js`), the **state-change bus** + **Problem Library** seam
(`simFacade()` / `notifyStateChange`), the `window.simAPI` contract, the boot watchdog, and the
live `COL` token map. It **exports** `initSim(config)` plus the helper toolkit a lesson imports
directly: `apl, planeGrid, fatLine, asg, alp, acircle, asgCentre, asp, acr, adm, alb, albBox, mix,
roundRect, setRange, setNote, announce, flowNote, showToast, toW, foldStateAt` and the constants
`LW` (line weights) and `COL` (colours).

**`src/shell.css`** holds the chrome: `:root{}` tokens (including the `--z-*` ladder, `--color-success*`,
and the premium motion keyframes), bundled `@font-face`, the
`#wizard`/`#sim-viewport`/`.wizard-main`/`#step-card`/`#step-rail`/`.brand`/`.chapnav` shell,
control primitives, `#term-pop`, and the premium component CSS injected by `chrome.js`
(`.wizard-toggle`, `.vp-cluster` quick-views/connector/Compare chip, `.compare-card`, `.fa-symbol`,
`.vp-hint`/`.vp-spotlight`/`.vp-note`, `.sim-toast`/`.sim-restoring`, `.reset-confirm`, `.done-badge`,
the `.problem-library` / `#active-problem` family), the mobile notice, and reduced-motion rules.
Each page links it once: `<link rel="stylesheet" href="./src/shell.css">`. Rare page-specific CSS
stays in a small inline `<style>` (e.g. the Lines construction-UI panels and the Dimensioning
mini-challenge styles). The Lines construction-aid **tokens**
(`--construct`/`--locus`/`--tl-green` + their `*-ink` text variants) now live in `shell.css`'s
`:root` so the engine's `readTokens` (via `lines.js` `cfg.tokens`) and the page CSS share one
source — there is no hard-coded hex left in any of the seven shells.

**`initSim(config)` contract** (per page). Required: `mode`, `steps`, `terms`, `defaultData`,
`draw3D`. Common optional fields:

| Key | Purpose |
|---|---|
| `mode` | `'single'` (one 3D stack, full-bleed — intro lessons) or `'dual'` (always-3D main pane + on-demand Compare card hosting the 2D/3D second view — Points/Lines) |
| `chap` | marks the active `.chapnav` tab (CSS/HTML only) |
| `steps`, `terms` | pure data (`src/<lesson>Steps.js`) — the rail sequence + the term glossary |
| `defaultData` | `() => freshDataObject` (e.g. `defaultPointData`) |
| `resolve` | `(data) => model` — lesson-shaped resolved geometry, passed straight to the draw fns |
| `defaultView` | per-lesson view-flag defaults merged under each step's `view` |
| `draw3D(g, ctx)` | **required**; `ctx = { model, raw, view, COL }` (`view.connectors` + `view.folded` ride along) |
| `draw2D(g, ctx)` | dual mode only — drawn into the Compare card (and into the main S3 in the unfolded state is **not** done; main is always 3D) |
| `buildAnimScene(g, ctx)` | fold lessons; returns `{ apply(p) }` mapping progress `p∈[0,1]` onto the rotating sheet |
| `afterRebuild` / `beforeRebuild` | optional hooks (e.g. quadrant-table highlight + slider sync; overlay teardown) |
| `beforeFold` | optional; runs before a fold starts (e.g. Lines exits an open construction overlay) |
| `describe(data, view) => string` | optional screen-reader mirror of the viewport result |
| `wireControls(api)` | optional; lesson wires its own sliders/fields/selects. `api = { rebuild, getData, setRange, setNote, announce, compare, beginOverlay, exitQuickView, swap, isMain3D }` (`exitQuickView` eases the camera back to free-orbit when an ortho quick-view is stale; `swap`/`isMain3D` are deprecated no-op shims) |
| `ui` | `{ faSymbol, quickViews, connectors }` — reveal the matching injected viewport chrome for this lesson |
| `compareGate(view) => bool` | gates the Compare chip (Points: `v.showHP && v.showVP`; Lines: `v.showFV && v.showTV`) — preserves the 2D-drawing pedagogy |
| `compareSplit` | dock the **expanded** Compare card to the right HALF of `#sim-viewport` (the engine shrinks `#c3d` to the left half via `isSplit()`/`layout()`) — a docked side-by-side `[3D │ 2D]` with a hairline seam, no shadow. Used by **Points** and **Lines** |
| `compareDefaultSize` | `'expanded'` makes the Compare chip open straight into that size (so with `compareSplit` it opens the side-by-side split) and hides `#compare-expand` (no compact-PiP toggle). **Lines** sets this so its Compare is the side-by-side, not a floating PiP; Points omits it (chip → compact PiP, expand → split) |
| `workbenchControls` | `['tl','disthp','distvp','theta','phi']` — opt into **Compare workbench mode** (Lines only): while the expanded split is open the engine collapses the wizard (true 50/50) and **re-parents** these `.ctrl` driver fields into the docked `#workbench-rail` under both panes, so the live parameters stay reachable and both views update together (`syncWorkbench`/`enterWorkbench`/`exitWorkbench`; desktop-only). Points/intro lessons omit it → unaffected. See `@DESIGN.md` + ADR-021 |
| `problems` | `{ list, tiers, fieldLabels, entryStep }` — opt into the Problem Library (Points/Lines only; intro lessons omit it → feature absent, zero cost) |
| `spotlights` | `{ id: { tone:'hp'|'vp'|'ink', text } }` — first-seen contextual chip copy (steps reference an id via `spotlight:'key'`) |
| `resetConfirmWhen(data) => bool` | arms the inline two-state Reset confirm only when there is work to lose (intro lessons omit it → instant reset) |
| `cam3`, `cam2` | optional default-camera overrides — the S3 perspective / S2 default poses (the ortho quick-views + fold fit-to-box, so they don't need pose overrides) |
| `orthoViews` | opt into the **dual perspective/ortho camera** (Points/Lines): orthographic quick-views with a perspective↔ortho morph and the flattened 2D pan. The fold itself stays on the **perspective** camera (held-angle dolly — see the fold section). Intro lessons omit it → single perspective camera, zero cost |
| `autoFrame` | opt into **clip-aware auto-zoom** (`reframeIfClipped` at the end of `rebuild()`): the perspective camera dollies back when the geometry grows past the frame |
| `contentBox(model) => Box3` | world-space box of the **meaningful geometry only** (point/line + feet, not the grid) — feeds the auto-zoom + the ortho quick-view fit |
| `flatViewBox(kind, model) => Box3` | world-space box of a flattened-sheet region (`'front'`/`'top'`/`'side'`/`'all'`) — feeds the held-angle fold framing (`framePerspectiveToFlat`, `'all'`) + the flat 2D quick-view pan |
| `foldBtn`, `foldLabels`, `foldGuard`, `foldAnnounce` | fold-button id, label set (`idle/forward/refold/reverse`), optional guard, and SR announcements |
| `tokens` | `{ key:'--css-var' }` — extra CSS tokens to add to `COL` |

Per-**step** fields (in `STEPS[]`): `title`, `lead`, `body[]`, `hint`, `controls[]` (which `.ctrl`
wrappers to reveal), `view` (the viewport flags), `set` (data overrides — the Lines case steps bind
a line orientation), `orbitHint` (show the one-time orbit hint), `spotlight` (a `cfg.spotlights`
id), and `done(data,view)=>bool` + `doneText` (the quiet per-step success badge).

**Thin-page pattern:** an HTML shell (links `shell.css`, holds the `#step-card`/`#step-rail`/
`#controls` markup + the viewport ids) + a `<lesson>.js` that imports `engine.js` + its
`src/<lesson>Data.js` + `src/<lesson>Steps.js`, defines `draw3D` (and `draw2D`/`buildAnimScene`
when needed), and calls `initSim({…})`. Adding a future lesson (conics, auxiliary planes) is a
new page + data, no engine change.

---

## Shell + Guided Stepper (controller in `src/engine.js`)

Every page's outer shell mirrors Module 2 (markup in the HTML shell, styles in `shell.css`, and
the controller in the engine):

- **`#wizard`** — the right-hand stepper panel. Holds the `.brand` wordmark (an `<a>` linking
  home to `index.html`), the `.chapnav` chapter switcher, and a `.wizard-main` flex row with
  `#step-card` (the lesson card, with Back/Next/Reset in the card footer) beside `#step-rail`. A
  `#wizard-toggle` chevron (injected chrome) collapses/expands the panel via `body.wizard-collapsed`.
- **`.chapnav`** — the seven-tab cross-page switcher present on every page:
  **Planes · Line types · Dimensioning · Quadrants · First-angle · Points · Lines**. The active
  tab is set per page via the `chap` config value (CSS/HTML only).
- **`#sim-viewport`** — the canvas area. Wraps the renderer machinery: `#canvas-area`, `#c3d`
  (always the main pane), and — in dual mode — `#c2d` (the Compare-card stack, hidden until the
  card opens). All in-viewport chrome (`#wizard-toggle`, the `.vp-cluster` of quick-view / connector
  / Compare chips, `#compare-card`, `#fa-symbol`, `#vp-orbit-hint`/`#vp-spotlight`/`#vp-flow-note`,
  `#sim-toast`/`#sim-context-lost`) is **injected by `chrome.js` at boot**, not hard-coded in the
  seven shells — so a chrome change lands once and can't drift.
- **`#step-rail`** — a **vertical numbered rail** (`.rail__item` / `.rail__btn` /
  `.rail__marker` / `.rail__label`, with a `::before` connector). State classes
  `is-complete` / `is-current` / `is-upcoming`; keyboard-navigable; learners can revisit any
  step up to `maxReached`. The rail builder + click handler live in `src/engine.js` (`buildRail`).

**Boot order (`boot()` in `src/engine.js`)** — injection must precede `wire()`'s id queries:
`readTokens → injectChrome(#sim-viewport) → injectCardChrome → [injectLibraryChrome if cfg.problems]
→ build(S3) [+ build(S2) dual] → wireContextLoss → initOnboarding(S3.ctrl, cfg.spotlights) →
[initProblemLibrary(simFacade(), cfg.problems) if cfg.problems] → wire → buildRail → layout →
renderStep(0) → loop`. The library chrome + controller are gated on `cfg.problems`, so intro
lessons pay nothing.

`#wizard`, `#sim-viewport`, and `.brand`/`.chapnav` are CSS/HTML only. The engine drives the
stepper against stable ids (`#eyebrow`, `#step-title`, `#step-lead`, `#step-body`, `#hint`,
`#step-rail`, `#controls`, `#btn-back`/`#btn-next`/`#btn-reset`), so a lesson supplies only data.

Each lesson is a sequence defined as pure data (`STEPS[]` in `src/<lesson>Steps.js`) and rendered
by the engine's stepper controller. The Points arc, for example, is Orient → Intuition →
Problem-solving:

1. **The two reference planes** — planes only, no controls.
2. **Lift the point above HP** — reveals `distHP`; shows P + HP projector + top view `p`.
3. **Move the point in front of VP** — reveals `distVP`; adds VP projector + front view `p'`.
4. **Unfold the planes** — reveals the fold button.
5. **Explore the four quadrants** — reveals the quadrant selector + quadrant labels.
6. **Set up and solve a problem** — reveals `distRP` and all numeric entry.

**Progressive disclosure.** Each step's `controls` array lists which `.ctrl` wrappers in
`#controls` are shown (`hidden` toggled); each step's `view` object sets the viewport flags
(`showPoint`, `showHP`, `showVP`, `showCoord`, `showQuad`) consumed by `draw3D`/`draw2D`.
`rebuild()` always renders for `viewFor(step)`, so navigating steps re-renders the viewport
without changing the data.

**2D drawing gate.** `draw2D` only plots `p`/`p'` once **both** `showHP` and `showVP` are
true (step 3+); before that it shows an in-viewport empty-state. The Compare chip is hidden by the
same gate (`cfg.compareGate`). This avoids displaying the counterintuitive `distHP → p'` /
`distVP → p` mapping before unfolding is taught.

**Term popovers.** Inline `<button class="term" data-t="…">` open the `#term-pop` tooltip
from the injected `TERMS` on hover, focus, or click; Escape and scroll dismiss. Definitions live
in each lesson's `src/<lesson>Steps.js`.

**Accessibility.** Live region (`#live`) announces step changes; an optional `cfg.describe()`
mirrors the viewport result into `#vp-status` (debounced); sliders carry `aria-valuetext`; focus
rings everywhere; `prefers-reduced-motion` snaps the fold (and every tween) to its end and reveals
the flat result instead.

---

## Renderer-stack architecture + Compare View (critical — lives in `src/engine.js`)

The renderer stacks live in the engine and are parameterized by `mode`. A stack is
`{ scene, cam, rend, ctrl, grp, lineMats, sweeps, lr }` (`lr` is a per-scene `CSS2DRenderer` for live
DOM labels). For `cfg.orthoViews` lessons (Points/Lines) the **main stack `S3` additionally carries
a second, orthographic camera** — `S3.oCam` (`OrthographicCamera`) + `S3.oCtrl` (a second
`OrbitControls`), added by `attachOrtho()` at boot. Module-level `actCam`/`actCtrl` point at whichever
pair is live (perspective by default; the ortho pair while a quick-view or the folded sheet shows),
and `loop()` renders `actCam`. S2 stays single-perspective.

- **`mode:'single'`** (the five intro lessons) — one always-3D stack `S3` on canvas `#c3d`,
  full-bleed. No `#c2d` / Compare card.
- **`mode:'dual'`** (Points/Lines) — **two completely independent stacks**: `S3` always the 3D
  scene on `#c3d` (the main pane), `S2` the second scene on `#c2d` (the Compare-card stack). This
  is the most important architectural decision in the sims.

```
S3 = { … }   ← always the 3D scene, always full-bleed on canvas #c3d  (main pane)
S2 = { … }   ← the Compare-card scene on canvas #c2d  (dual only; sized/painted only while the card is open)
```

**The canvases never move in the DOM. The renderers never cross. The scenes never swap between
stacks.** (Earlier attempts to move DOM elements caused the S3 axes helper to bleed into S2 and
broke layout — and the `AxesHelper` is gone for the same off-palette-colour reason.) The dual-camera
system does **not** break this invariant: on `cfg.orthoViews` lessons it is the **cameras** that swap
on S3 (perspective ⇄ ortho, via `actCam`), never the canvas, renderer, or scene.

### Compare View (re-houses the old PiP + `swap()`)

The main pane is **always S3 / `#c3d`**. The second stack **S2 / `#c2d` survives** but is now the
content of an **on-demand floating Compare card** (`#compare-card`, injected chrome) instead of a
persistent Picture-in-Picture. The `compare = { show(size?), hide(), toggle(), isOpen() }` facade
(exposed on the `wireControls` api) drives it; `swap()` / `isMain3D()` remain only as deprecated
no-op shims so older call sites don't throw.

- **What the card shows** depends on the main-pane state (module flag `s2Is3D`):
  - **Main live 3D (unfolded):** the card shows the **2D drawing** — `cfg.draw2D` into `S2.grp`,
    `S2.cam` at the 2D pose (`cam2`). This is the textbook orthographic sheet.
  - **Main folded flat:** the card shows a **live-rebuilt 3D view** — `cfg.draw3D` into `S2.grp`,
    `S2.cam` at the 3D pose (`cam3`), OrbitControls enabled when the card is expanded. Never a
    snapshot — it is the same `fill()` machinery, content-flagged by `s2Is3D`.
- **Compact / expanded** (`compareSize`, `data-size` on the card): a small "drawing sheet" card
  hovering over the wizard seam, or grown to ~76 % of the viewport (this replaces the old
  "swap 2D to main pane" capability — the Lines sim opens it **expanded** for its Traces /
  True-Length constructions via `api.compare.show('expanded')`).
- **Docked side-by-side split** (`cfg.compareSplit`): when the expanded card is shown, it docks to
  the right HALF of `#sim-viewport` (`.is-split`, a hairline seam, no shadow) and `layout()` shrinks
  `#c3d` to the left half — a true `[ 3D │ 2D │ wizard ]` three-pane read with the wizard still
  operable (drag a slider, both panes update). **Points** opts in (chip → compact PiP, expand →
  split). **Lines** opts in *and* sets `cfg.compareDefaultSize:'expanded'`, so its Compare chip
  opens straight into the side-by-side split (the floating PiP + compact toggle are retired for
  Lines); its Traces / True-Length constructions render in the right pane beside the live 3D.
- **Only S2's group content + camera pose change** — consistent with the `rebuild()` disposal
  contract. The canvas itself never moves.
- **S2 is always perspective** (`S2.cam` at `cam2`/`cam3`): the dual-camera/ortho-morph system lives
  only on the S3 main pane, so the Compare card is unaffected by it.
- **A fold start auto-closes the card** (`runAnimation` calls `compare.hide()`); the chip is hidden
  until `cfg.compareGate(view)` passes.

**Canvas sizing is JavaScript-controlled, not CSS-controlled.** `layout()` reads
`area.clientWidth / clientHeight` and calls `S3.rend.setSize(w, h, false)` for the full-bleed main
pane. In dual mode, when the Compare card is open it measures `.compare-card__stage`'s rect and
floats `#c2d` **`position:fixed`** over it (escaping `#canvas-area`'s `overflow:hidden`; this relies
on the **no-transform invariant** in `DESIGN.md` — no CSS `transform` on `#sim-viewport` /
`#canvas-area` / `body`). The CSS2D label overlay (`lr`) is placed + clipped to match. Closed → the
canvas is `display:none` and S2 isn't rendered. Because `setSize(w,h,false)` is called with
`updateStyle:false` (it sets only the DPR-scaled backing store, never the CSS box), `layout()`
**must** set each canvas's CSS `width`/`height` itself — it writes them inline (in CSS px, matching
the logical size) into the `c3.style`/`c2.style` `cssText`. (Omitting this lets the canvas lay out
at its backing-store pixel size, so on any DPR>1 display the viewport renders blurry/upscaled.)
`LineMaterial.resolution` is kept in sync per stack via `s3Px()`/`s2Px()` → `updateLineRes()` on
resize / Compare open/close / wizard collapse.

---

## rebuild() pipeline (non-negotiable — in `src/engine.js`)

Every parameter or step change routes through the engine's `rebuild(d)` (it returns early while
`animating`):

1. `cfg.beforeRebuild?.(d)` — optional lesson hook (e.g. Lines tears down a construction overlay)
2. clears any frozen fold state — if leaving a folded sheet by a path other than the reverse fold,
   restores the learner's pre-fold camera pose (`snapCameraHome`); resets the fold button + hides
   `#fa-symbol`; sets `s2Is3D = false` (a live main ⇒ the card shows the 2D drawing)
3. cancels any in-flight draw-on, then `model = cfg.resolve ? cfg.resolve(d) : d`; builds
   `ctx = { model, raw:d, view, COL }` where `view = { ...cfg.defaultView, ...steps[step].view }`
   plus `view.connectors` (the connector toggle) and `view.folded`
4. `fill(S3, true, ctx)` — disposes `S3.grp`, calls `cfg.draw3D(g, ctx)`
5. `refillCompare(ctx)` — dual mode, **only when the card is open**: disposes `S2.grp`, repaints it
   for the current content mode (`draw2D` or live `draw3D`) and sets `S2.cam`
6. if step nav armed it (`drawOnNext`), `startDrawOn()` ramps the fresh S3 strokes in (~0.8 s)
7. `cfg.afterRebuild?.(d, ctx)` — optional (e.g. Points' quadrant-table highlight + slider sync)
8. `syncCompareChipVisibility(view)` + `updateCompareChip()` + `updateDoneBadge()` — chrome sync
9. `announceState(d, view)` — debounced screen-reader mirror via `cfg.describe`
10. `notifyStateChange(d, ctx)` — fires the state-change bus (the Problem Library self-check seam;
    empty + free on intro lessons)

The lesson supplies `resolve`/`draw3D`/`draw2D`; the per-lesson `toW(cm)` (cm → world units,
÷ 10) and sign logic live in its data layer (e.g. `resolvePosition` in `pointData.js`).

**Disposal contract** (run inside the engine's `fill()` before every rebuild — note it also removes
the CSS2D label DOM nodes):
```js
grp.traverse(o => {
  if (o !== grp) {
    if (o.element?.parentNode) o.element.remove();   // CSS2DObject label DOM node
    o.geometry?.dispose();
    [o.material].flat().forEach(m => { m?.map?.dispose(); m?.dispose(); });
  }
});
grp.clear();
```

Do not skip disposal. Geometry, materials, and the live label DOM nodes accumulate fast otherwise.

---

## Engineering graphics conventions (First Angle Projection — SP 46:2003)

The conventions below are written for the Points sim; the Lines sim (`lines.js`) follows the
same world-axis layout, fold-line geometry, and HP/VP colour encoding for each end point and its
traces. The Quadrants and First-angle intro lessons reuse the same `pointData.js` sign logic and
the same world-axis remap in their `draw3D`, so the geometry reads identically across all of them.

### Point data (stored in cm, converted to world units for rendering)

```
distHP  = perpendicular distance of P above the Horizontal Plane
distVP  = perpendicular distance of P in front of the Vertical Plane
distRP  = perpendicular distance of P from the Profile (side) Plane
quadrant = Q1 | Q2 | Q3 | Q4
```

Scale: `CM_SCALE_DIV = 10` → 1 cm = 0.1 world units. Sliders accept 0–100 cm; typed input
accepts up to 200 cm.

### 3D scene conventions (right-handed, Y-up — Three.js default)

```
HP = XZ plane at Y = 0   (flat teal plane, horizontal floor)
VP = XY plane at Z = 0   (upright amber plane, facing +Z toward viewer)
Fold line = X axis (the TRUE HP ∩ VP intersection)
```

Both planes share the X-axis, so HP can fold flat onto VP about that exact line (see the
unfolding animation). `draw3D` **remaps** the resolved position to world axes —
`q = (lateral distRP → X, height distHP → Y, depth distVP → Z)` — so distVP becomes the depth
axis (+Z = in front of VP). `resolvePosition()` itself is unchanged; only `draw3D`/
`buildAnimScene` interpret its output via `q`.

**Sign table for resolvePosition()** (returns raw signed cm — `pointData.js` is unchanged; the
remap to world axes happens in `draw3D`):

| Quadrant | x = ±distVP | y = ±distHP | z = ±distRP |
|---|---|---|---|
| Q1 — Above HP, In front of VP | +distVP | +distHP | +distRP |
| Q2 — Above HP, Behind VP      | −distVP | +distHP | +distRP |
| Q3 — Below HP, Behind VP      | −distVP | −distHP | +distRP |
| Q4 — Below HP, In front of VP | +distVP | −distHP | +distRP |

In `draw3D` these map to world as `q.x = z (distRP)`, `q.y = y (distHP)`, `q.z = x (distVP)`
— so "in front of VP" is +Z (toward the camera).

### 2D drawing conventions (after HP unfolds 90° about the X fold line)

| View | Plane | Position relative to XY line | Controlled by |
|---|---|---|---|
| `p'` — front view | VP | Above XY for Q1/Q2, below for Q3/Q4 | `distHP` |
| `p`  — top view   | HP | Below XY for Q1/Q4, above for Q2/Q3 | `distVP` |

**Critical:** `distHP` controls `p'` distance from XY (how high P is above HP projects onto VP
as the front view elevation). `distVP` controls `p` distance from XY (how far P is in front of
VP projects onto HP as the top view after HP rotates down). This is **opposite to what seems
intuitive** — do not swap them back.

### 2D sign logic per quadrant

```js
// p' on VP (front view)
const elevSign = (quadrant==='Q1'||quadrant==='Q2') ? 1 : -1;
const ey = elevSign * d.distHP;   // distHP → p' distance from XY

// p on HP (top view)
const planSign = (quadrant==='Q2'||quadrant==='Q3') ? 1 : -1;
const py = planSign * d.distVP;   // distVP → p distance from XY

// Lateral X offset (PP distance)
const signLat = (quadrant==='Q2'||quadrant==='Q3') ? -1 : 1;
const lx = signLat * d.distRP;
```

### Colour convention (platform functional encodings — read from CSS tokens)

```
--color-hp-line = '#007f7c'  (teal,  SOLID)   → HP plane, p foot, projector to HP, p label
--color-vp-line = '#bc5d1e'  (amber, DASHED)  → VP plane, p' foot, projector to VP, p' label
```

HP is the **flat teal plane**; VP is the **upright amber plane** — the colour-blind-safe pair
from `../DESIGN.md`. **Two-Cue Rule:** colour is never the only signal, so in the **3D
pictorial** scene everything HP is drawn **solid** and everything VP is drawn **dashed** — the
teal projector drops vertically from P to HP (top view); the amber dashed projector reaches
horizontally to VP (front view). In the **2D orthographic drawing**, the projectors follow ISO
line types instead: solid **Type-B continuous thin** lines (per N.D. Bhatt), since the HP/VP
distinction there is carried by **position** (top view below the XY line, front view above), not
line style. Projection feet are drawn as filled **dots** (`acr`), not crosses.

**Chrome-Only Blue Rule:** the accent blue (`--color-accent #1f66b5`) is for guidance chrome
only (step rail, primary buttons, slider fill, focus rings, the `.brand` accent dot, and the
premium chrome the upgrade added — quick-view / Compare / connector chips, the wizard toggle) and
never appears as linework **inside** the viewport. (Success is its own `--color-success` green —
the toast and done-badge check — never the accent blue.) The active-quadrant label in the 3D scene
is **ink**, not accent. The `AxesHelper` was removed because its red/green/blue is off-palette and
leaked blue into the viewport.

---

## Cinematic reversible fold animation (fold ⇄ unfold, camera sweeps square-on)

Triggered by the fold button. Runs only in the 3D scene (S3). **The timeline driver is generic in
`src/engine.js`** (`runAnimation` → `foldForward`/`foldBack` → `animateFold`); **the scene itself
is lesson-supplied** via `cfg.buildAnimScene(g, ctx)`, which builds the rotating sheet into the
engine-cleared `S3.grp` and returns an `{ apply(p) }` closure. The engine's `prepFoldScene()`
disposes the live scene, resets the fat-line material registry, and calls `buildAnimScene` in the
SAME world axes as `draw3D`, so the sheet's first frame is pixel-identical to the static scene —
**no jump.** The exported `foldStateAt(p)` returns `{rot,op}` (HP rotation + the fading depth-cue
opacity) for the forward timeline; **reverse evaluates it at `1 − t`**, an exact mirror (same
duration `FOLD_DURATION = 2800 ms`, split `FOLD_SPLIT = 0.72`, easing, hinge). Button text comes
from `cfg.foldLabels` (`idle`/`forward`/`refold`/`reverse`).

### Cinematic camera (this OVERTURNS the old "camera never moves during the fold" rule)

The fold timeline **also** eases the camera, in the same `animateFold` frame loop that rotates the
sheet. There are **two camera paths**, chosen by `cfg.orthoViews`:

**`cfg.orthoViews` lessons (Points / Lines) — the HELD-ANGLE fold.** `animateFold` delegates to
`animateFoldHold()`: the **perspective** camera `S3.cam` stays live and **never rotates** — its view
DIRECTION is held constant while it dollies + pans along that direction to keep the folding sheet
framed. The learner watches the HP plane **hinge flat from their own 3D angle** (the pedagogical
3D→2D morph). **No ortho sweep, no projection morph during the fold** — the square-on true-orthographic
read lives in the **Compare card** (and the Front quick-view squares up on demand). This replaced the
earlier `animateFoldOrthoCamera`, which flew `S3.oCam` front-on with a perspective→ortho morph: it read
as a bottom-right swoop and hid the hinge edge-on.
- **Forward:** the learner's orbit pose is captured into `preFoldPose`; `framePerspectiveToFlat()`
  keeps the current view direction, recentres the target on the flattened-sheet box (`flatViewBox('all')`),
  and dollies to a `fitPerspectiveDistance` fill — so the whole flatten stays framed with no swing.
- **Reverse:** `S3.cam` eases from the held flat-framed pose back to `preFoldPose`, then `rebuild()`
  restores the live 3D scene.
- **Reduced motion** snaps — `snapFoldFlatHold()` (forward, same-angle dolly) / `restorePerspective(false)`
  + rebuild (reverse) — no tween; state still updates. The dual ortho camera + `projMorphK` remain, but
  serve only the **quick-views** now, not the fold.

**Legacy single-perspective fold (the First-angle intro lesson).** Unchanged: `animateFold` eases
`S3.cam` (+ `S3.ctrl.target`) with `easeCamera` to the **square-on `FRONT` pose** (`FRONT === QVL.front`,
the same pose the "Front" quick-view chip lands), and reverses back to `preFoldPose`. Reduced motion
uses `snapCameraToFront()` / `snapCameraHome()`.

**Both paths:**
- **Leaving a folded sheet without reversing** (Next / a slider edit) restores `preFoldPose` in
  `rebuild()` (orthoViews lessons first `restorePerspective(false)` to hand the camera back to
  perspective), so the camera never strands at the front angle.
- A fold start **cancels any in-flight `camTween` and `autoZoomTween`** and **closes the Compare
  card**, so two camera moves never fight. While `animating`, `loop()` skips `actCtrl.update()` so the
  fold owns the camera with no OrbitControls damping fight; the fold button is disabled.

**What happens (the sheet):**
1. The scene is rebuilt: VP (XY plane, z=0), fold line, point P, and `p′` + its VP-side
   construction are **static**. A `THREE.Group` (`hpGroup`) holds the HP plane mesh, border,
   HP label, `p` foot/cross/label, and the `p → fold line` connector — everything that must
   rotate rigidly with HP.
2. `hpGroup.rotation.x` eases `0 → +Math.PI/2` (90°) about the X-axis (the hinge). Because both
   planes share the X-axis, HP lands **coplanar** with VP in the z=0 plane: `p` swings to below
   the XY line, `p′` stays above — the textbook sheet.
3. The 3D **depth cues** (point P, its label, and the two *perpendicular* projectors `P→p` and
   `P→p′`) fade to opacity 0 over the last ~28 % of the timeline, leaving a clean 2D sheet. The
   `p′→fold` and `p→fold` connectors stay (they lie in the sheet plane and form the vertical
   projector through the XY line). The HP projector `P → foot` is **dynamic**: a `footTracker`
   Object3D rides inside `hpGroup` and the projector is redrawn each frame to the foot's current
   world position, tracking it during the fold (it is one of the cues that fade out).
4. **Forward end = frozen flat sheet** (`folded=true`). The `#fa-symbol` first-angle badge fades in
   (Points/Lines, via `cfg.ui.faSymbol`); the Compare chip relabels to "Compare 3D view"; the
   step's done-badge can light. The sheet stays until the user clicks **Fold back to 3D** (reverse)
   or changes a control / navigates a step (a normal `rebuild()` back to 3D). **Reverse end** sets
   `folded=false` and calls `rebuild()`.

The engine's `animating` flag is `true` during the tween. `rebuild()` returns early while it is set.

**The Points (`main.js`), Lines (`lines.js`), and First-angle (`firstangle.js`) lessons each
provide their own `buildAnimScene`; the reversible + cinematic machinery is shared.**

---

## Geometry helpers (exported from `src/engine.js`)

A lesson imports what it needs from `./src/engine.js`. All geometry helpers take `g` (a
`THREE.Group`) as their first argument:

| Helper | Purpose |
|---|---|
| `apl(g, size, color, opacity, euler)` | A reference plane: faint tinted fill + a plane-hued engineering grid, oriented by `euler` (intro lessons) |
| `planeSheet(g, s, planeCol, fillOpacity, euler, borderCol?, borderW?)` | A BOUNDED reference "sheet": faint translucent fill + thick plane-hued perimeter border (no grid — caller adds it). Used by Points/Lines for the bounded sheet (60×60 Lines / 40×40 Points); `apl` is left untouched for the intro lessons |
| `planeGrid(s, color)` | A faint plane-hued `GridHelper` (token-driven via `mix`), returned in XZ for the caller to orient |
| `fatLine(g, flat[], color, width, dashed)` | Core stroke primitive — a `Line2` (thick, crisp). Registers its `LineMaterial` in `curMats` |
| `asg(g, a, b, color, dashed, w?)` | Add a line segment (solid or dashed) — routes through `fatLine` |
| `alp(g, points[], color, w?)` | Add a closed loop polyline — routes through `fatLine` |
| `acircle(g, cx, cy, r, color, w?, segs?)` | Closed fat-line circle in the z=0 plane — routes through `alp` |
| `asgCentre(g, a, b, color, w?)` | Type-G **chain/centre line** (long-dash · gap · dot · gap), hand-tiled as lit `fatLine` pieces |
| `asp(g, x, y, z, r, color)` | Add a sphere (point P marker) with a paper halo behind it |
| `acr(g, cx, cy, cz, r, color, is3D)` | Add a point/foot marker — a thick filled disc (paper halo + colour dot), oriented in-plane by `is3D` (HP's XZ when 3D, else the z=0 plane). The textbook "thick dot" for a point |
| `adm(g, x1,y1,x2,y2, color, text)` | Add a dimension line with filled (`ShapeGeometry`) inward arrowheads |
| `alb(g, text, x,y,z, color, sx, sy, mono?, cw?)` | Text label — a live `CSS2DObject` DOM node (vector-sharp) |
| `albBox(g, text, x,y,z, color, h?)` | Boxed point label (P / p / p′): a live `CSS2DObject` chip styled by CSS `.lbl--chip` |
| `mix(a, b, t)` | Blend two token colours → `#rrggbb` (e.g. the boxed-label border tint, plane grids) |
| `roundRect(ctx, x, y, w, h, r)` | 2D-canvas rounded-rect path |

Control / announcement helpers are also exported for lesson wiring: `setRange`, `setNote`,
`announce`, `flowNote` (transient viewport banner), `showToast` (success toast), plus `toW`,
`foldStateAt`, and the constants `LW` / `COL`.

**Fat lines (`Line2`):** every stroke is a `Line2`/`LineMaterial` so line weight is real and
constant on-screen (widths live in the `LW` const, in CSS px). `LineMaterial` needs
`resolution` = the canvas pixel size; `fill()`/the fold builder set `curMats` + `curRes` (via
`s3Px()`/`s2Px()` for the active stack), and `layout()` calls `updateLineRes()` on resize /
Compare open/close / wizard collapse. Each scene owns `lineMats[]`. Dynamic fold trackers stay thin
`THREE.Line` (they fade).

**Labels are live DOM, not baked sprites.** `alb()` and `albBox()` build `CSS2DObject` nodes
re-projected every frame by each stack's `CSS2DRenderer` (`lr`) — vector-sharp at any zoom, constant
on-screen size, and screen-reader readable. The pointer-events:none overlay sits over the stack's
canvas; `placeLr()` sizes/positions/clips it to match (full-bleed, or the Compare-card stage). The
`alb` signature is preserved (`sy` drives font size, `mono` picks IBM Plex Mono vs Atkinson;
`sx`/`cw` are now no-ops). `albBox`'s `h` maps to the chip's on-screen font size; the white-chip +
same-hue border styling lives in CSS. Plane names (HP/VP/XY) stay plain `alb` with their token
colours.

`adm()` uses `THREE.ShapeGeometry` for filled triangle arrowheads. Arrowheads point **inward**
(toward each other). The label is placed to the left of the dimension line.

---

## Premium interaction layer (ported from Module 2 — full spec in `@DESIGN.md`)

Beyond the two sim features above, the engine carries Module 2's premium layer. Each piece is small
and gated, so intro lessons that don't opt in pay nothing:

- **Motion (`src/anim.js`).** A leaf rAF tween system with a named easing palette
  (`easeStandard`, `easeFold`, `easeCamera`, `easeDraw`, `easeDissolve` — all no-overshoot,
  y∈[0,1]). The engine `tick()`s it from `loop()`, so `simAPI.pause()` freezes in-flight tweens and
  `simAPI.reset()` `cancelAll()`s them. Drives the step-change projection draw-on, the cinematic
  fold camera, the quick-view camera moves, the **perspective↔ortho projection morph**, and the
  **clip-aware auto-zoom dolly**. Reduced motion snaps every tween to its end.
- **Injected chrome (`src/chrome.js`).** Three injection points — `injectChrome` (viewport),
  `injectCardChrome` (the step-card Reset-confirm + done-badge), `injectLibraryChrome` (the Problem
  Library entry + `#active-problem` panel + `#problem-library` overlay; gated on `cfg.problems`) —
  keep the seven HTML shells drift-free.
- **Onboarding (`src/onboarding.js`).** A one-time "Drag to rotate" orbit hint (persisted dismissed,
  auto-retired on the first OrbitControls `start`) and queued **contextual spotlights** (one chip at
  a time, first-seen-once, tone dots respecting the Two-Cue Rule). Lessons author copy via
  `cfg.spotlights`; steps trigger an id via `spotlight:'key'`. `initOnboarding` returns
  `{ showOrbitHint, hideOrbitHint, spotlight, cue, clearSpotlights }`.
- **Viewport aids.** Quick-view camera chips (Top/Front/Side, `cfg.ui.quickViews`): on
  `cfg.orthoViews` lessons these are **orthographic** views reached via a perspective↔ortho morph
  (`setView` → `engageOrtho` + `tweenCamFull`); re-clicking returns to free orbit
  (`restorePerspective(true)`); while the sheet is folded they become a **flattened 2D pan**
  (`setFlatView`). Non-orthoViews lessons keep the legacy 1500 ms `easeCamera` perspective snap
  (`tweenPerspective`, the renamed old `tweenCamera`). Plus **clip-aware auto-zoom**
  (`reframeIfClipped`, `cfg.autoFrame`); a connector/projector declutter toggle that flips
  `view.connectors` the draw fns respect (`cfg.ui.connectors`); the `#fa-symbol` first-angle badge
  while folded (`cfg.ui.faSymbol`).
- **Feedback & resilience.** `showToast()` success toast (setTimeout-driven so it fades while the
  loop is paused); the inline two-state Reset confirm (`armReset`/`disarmReset`, armed only when
  `cfg.resetConfirmWhen(data)`); per-step done-badges (`step.done`/`doneText`); invalid-numeric-entry
  recovery via `flowNote('Kept N …')`; WebGL `webglcontextlost`/`restored` recovery on both canvases
  (`wireContextLoss` → "Restoring…" chip → pause → rebuild+layout+resume).
- **Problem Library (`src/problemLibrary.js` + `src/{point,line}Problems.js`).** A config-driven
  controller (`initProblemLibrary(simFacade(), cfg.problems)`) serving both sims: a full-viewport
  modal (focus-trapped, Escape, rAF-paused while open), tiered problem grid, hints revealed one at a
  time, a ±0.5-tolerant self-check driven off the rebuild state-change bus, and a panel "Complete &
  next problem" CTA. **It never auto-fills** — loading a problem resets to defaults and routes to the
  dial-able step (Points → the final solve step; Lines → the first "True Length" step via `entryStep`,
  from which the learner walks the dedicated per-step controls — TL on step 1, distance HP/VP on
  step 2, θ/φ on step 3 — and the self-check fires on every change); the student dials the setup and
  the check lights green.

---

## Dimension and layout rules

The Points and Lines sims display **millimetres** (1 world unit = 10 mm). The shared
Quadrants/First-angle intro lessons still display **cm** off the same `pointData.js` — relabel,
not rescale (see the `points-mm-units` memory).

- **Slider range (Points distances):** 0–100 mm (HTML `min=0 max=100 step=1`)
- **Slider range (Lines True Length):** 20–150 mm (HTML `min=20 max=150 step=1`)
- **Typed input:** up to 200 (clamped in the `change` handler; over-range says so via `setNote`,
  whose unit is now passed to `setRange` so each lesson reads in its own unit)
- **Default values (Points):** `distHP=20, distVP=20, distRP=0, quadrant=Q1`
- **World scale:** 1 mm = 0.1 world units (`CM_SCALE_DIV = 10`; the name is legacy)
- **Reference planes:** the sims draw a bounded sheet — **Lines 60×60 units (600 mm)**, **Points
  40×40 units (400 mm)** — faint fill + thick plane-hued border (engine `planeSheet`) under a 10 mm
  grid (`gridM2` grey for Points, `planeGrid` hued for Lines). Enlarged so big lines / typed 200 mm
  points never bleed off the glass; the auto-zoom keeps the working area framed regardless of sheet
  size. The three intro lessons keep `apl()` unchanged.
- **Dimension labels:** show real mm values from `raw` data, not world-unit values

---

## Common bugs and fixes

| Symptom | Cause | Fix |
|---|---|---|
| Blank 3D canvas on load | `layout()` runs before `window load`, dimensions are 0 | Use `window.addEventListener('load', ...)` + `setTimeout(layout, 100)` |
| Blue/green stray linework in viewport | `AxesHelper` (RGB) leaks into S2 / breaks Chrome-Only Blue | `AxesHelper` removed entirely; planes + fold line + quadrant labels orient the view |
| Labels show fallback font | Web font not loaded when the scene first paints | `document.fonts.ready.then(() => rebuild(data))` re-renders the CSS2D labels once fonts load |
| Slider fill doesn't move (WebKit) | `--p` custom property not updated | `setRange()` sets `el.style.--p` on every sync; Firefox uses `::-moz-range-progress` |
| Compare card mis-placed / clipped | A CSS `transform` on an ancestor establishes a containing block for the `position:fixed` `#c2d` | Keep `#sim-viewport`/`#canvas-area`/`body` transform-free (the `DESIGN.md` no-transform invariant); `layout()` floats `#c2d` from viewport rects |
| Arrowheads wrong direction | `pointingUp` flag inverted | Arrow at y1 points toward y2; arrow at y2 points toward y1 |
| `distHP` moves wrong line in 2D | Variables swapped | `distHP` → `ey` (p' on VP); `distVP` → `py` (p on HP) |
| Animation rotates wrong way | Wrong sign on `hpGroup.rotation.x` | Use `+Math.PI/2` (positive X rotation swings HP forward/down) |
| Scene "jumps" when the fold starts | `buildAnimScene` built the sheet in a different coord system than `draw3D` | Both must use VP=XY(z=0), HP=XZ(y=0); the fold's frame-1 sheet must equal `draw3D` |
| Camera jumps/teleports on the fold | Pose not captured/restored, or controls updated during the tween | The fold OWNS the camera: store `preFoldPose`, restore on reverse/leave; `loop()` skips `actCtrl.update()` while `animating` (do not re-add it). orthoViews lessons HOLD the perspective angle via `animateFoldHold`/`framePerspectiveToFlat` (no ortho sweep); the legacy intro fold eases `S3.cam` to FRONT |
| Fold swoops/turns instead of showing the hinge | The fold rotated the camera to a front-on ortho view (the removed `animateFoldOrthoCamera`), so the HP plane went edge-on | orthoViews fold must HOLD the view direction — `animateFoldHold` only dollies+pans along the fixed dir (`framePerspectiveToFlat`); the ortho camera/`projMorphK` are for quick-views only |
| Quick-view cuts instead of morphing | `projMorphK` not driven, or `applyProjectionMorph()` not called after `actCtrl.update()` in `loop()` | `engageOrtho` arms `projMorphK=1`; `tweenCamFull` drives it 1→0; `loop()` stamps `applyProjectionMorph()` each frame while it is non-null |
| Auto-zoom frames the whole grid (or never fires) | `cfg.contentBox` returns the `S3.grp` box (incl. the 60-unit grid), or `cfg.autoFrame`/`contentBox` missing | `contentBox` must return only the meaningful geometry (point/line + feet); `reframeIfClipped` is push-back only and runs at the end of `rebuild()` behind `cfg.autoFrame` |
| Fold ends perpendicular, not flat | Planes didn't share the hinge line | VP must lie in the plane HP rotates *into* (z=0); they share the X-axis |
| Final frame still shows floating P + diagonal projectors | Depth cues not hidden | Fade the depth cues (P, P label, `P→p`, `P→p′`) to opacity 0 over the last ~28 % |

---

## What is NOT in this module (out of scope)

- Orthographic projection of solids (Module 2 — separate sim)
- Host Simatrix navbar, login, account UI, module browser
- Any server-side code, database, or API calls
- Build tooling of any kind — no `package.json`, bundler, or ZIP packaging (the module runs as
  a plain folder via XAMPP)

---

*Module 1 — Engineering Graphics: Foundations of Projection · seven live 3D guided-stepper
lessons (Planes · Line types · Dimensioning · Quadrants · First-angle · Points · Lines) on one
shared frame (`src/engine.js` + `src/shell.css`) with a Module-2 premium interaction layer
(`@DESIGN.md`).*
*Simatrix Engineering Graphics Platform · KTU B.Tech Syllabus*
*First Angle Projection · SP 46:2003 (BIS) · Built with Three.js 0.160.0 · No build tools required*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)

## Keeping Root Documents Current

After completing any task, check whether the work involved:
- A non-obvious decision between two real options → add an ADR to ../DECISIONS.md
- A reversed or superseded previous decision → update the relevant ADR status 
  in ../DECISIONS.md and add a new one
- A new rule that must be enforced going forward → add it to ../RULES.md 
  with its source ADR cited
- A structural change to the codebase (new files, new relationships) → 
  update ../ARCHITECTURE.md Section 2 or 3

Do not update these files for routine changes. Only update when the 
change has architectural or decision-level significance.