# Simatrix — MODULE-STARTER

> **Build verified by reading the live codebase and the five root docs on 2026-06-28.**
> Every byte-identical claim below was confirmed with `md5sum`; every rule cites its source.

---

## Preamble

This is the **start-here playbook for creating a new Simatrix simulation** — a new teaching topic
inside the existing Engineering Graphics family, or a whole new subject module in a different
discipline. It exists because Simatrix has **no build step, no shared library, and no sync
tooling** (ADR-001, ADR-009): every Engineering Graphics topic is a hand-made copy of an existing
folder, and the copies *will* drift unless you copy the right files and adapt only the right ones.
This file tells you, file by file, what to copy unchanged, what to adapt, and what to build fresh —
grounded in the actual differences between the master and its two existing deploy copies.

**The single most important rule for Cases A and B: `Module2/` is the master and the single
source of truth** (ADR-009, RULES.md §1.1, ARCHITECTURE.md §9.1). For a new 3D-solids topic
(Case A), **you start by copying `Module2/`** — never a topic copy, and never a half-remembered
structure. The folder names (`graphics_module_2_topic_1_introduction`,
`graphics_module_2_topic_2_simple_positions`) do **not** reveal that they are copies of `Module2`,
so you cannot infer the master from the directory listing — you have to know it, and now you do.

> **Case C is different (2026-07-02 revision).** A whole new subject module in a different
> discipline is **not** Engineering Graphics — it does not clone `Module2`/`Module1` and does not
> share the root `ARCHITECTURE.md`/`DECISIONS.md`/`RULES.md`. It starts from the platform-only
> foundation instead: `../CLAUDE.module-template.md` + `../PLATFORM-RULES.md`. Section 5 below was
> rewritten to match; if you're doing Case C, you can skip straight to it after Section 1.

---

## Section 1: Before You Write a Single Line of Code

**If you are doing Case C (a whole new subject module, different discipline), stop here** — the
five-root-docs list below is for Case A/B. Instead:

1. Read `../DESIGN.md` and `../PRODUCT.md` — the two root docs every Simatrix subject shares (same
   takeaways as items 4–5 below).
2. Read `../PLATFORM-RULES.md` — the subject-agnostic enforcement checklist. It is the Case A/B
   `RULES.md`'s content minus everything specific to 3D solids / orthographic projection.
3. Copy `../CLAUDE.module-template.md` into your new module folder as `CLAUDE.md` and fill it in —
   it tells you, inline, to write your own `ARCHITECTURE.md`, `DECISIONS.md`, and `RULES.md`
   before writing simulation code.

You do **not** read the root `ARCHITECTURE.md`, `DECISIONS.md`, or `RULES.md` — those three
describe the Engineering Graphics family specifically. Go to **Section 5** for the full Case C
walkthrough. Sections 2 – 4 and 6 – 9 below are written for Case A/B and cite the shared root docs
by their Engineering-Graphics-specific section numbers; read them only as a reference example of
the *pattern*, not as instructions to follow literally.

---

**Case A or B (a new topic inside the existing Engineering Graphics family):** reading the five
root docs below is **mandatory, not optional.** A contributor who skips them will
re-introduce a token, rename a label, or "fix" a deliberate decision and produce output that looks
plausible but is wrong — exactly the failure mode every warning in this repo exists to prevent.
Read all five, in this order:

1. **`ARCHITECTURE.md`** — *the map.* Take away the master→deploy relationship (§2, §9.1), the
   Module 2 orchestrator + leaf-module layout (§3), the Module 1 shared-engine layout (§4), and
   exactly which files are shared/identical vs. intentionally different (§7, §8).
2. **`DECISIONS.md`** — *the why (ADR log).* Take away why there is no build step (ADR-001), why the
   host contract is `window.simAPI` not `postMessage` (ADR-002), why topic clones are manual copies
   scoped by one `ENABLED_TIERS` flag (ADR-009), the folder-naming convention (ADR-020, ADR-024), the
   template-choice rule for new subjects (ADR-025), the headless verification approach (ADR-019), and
   that new topics consume the single root `DESIGN.md`/`PRODUCT.md` (ADR-022, ADR-023, ADR-028).
   **Never silently reverse an ADR** (RULES.md §8.4).
3. **`RULES.md`** — *what you must / must not do.* Read **Section 1** (master/deploy rules) and
   **Section 2** (platform/runtime rules) before touching anything; **Section 9** (anti-patterns) is
   the 60-second pre-flight scan. Every rule is an actionable ✅ DO / ❌ NEVER with a citation.
4. **`DESIGN.md`** — *the visual contract.* Take away that it is the **single platform-wide design
   system** (one root copy, ADR-022): the token table (§2.1), the named rules (Quiet Chrome,
   Chrome-Only Blue, Two-Cue, Two-Weight, Tabular, Flat-Ink, Border-Over-Shadow, §2.3/§3.3/§4.2),
   the component specs (§5), and the cross-module consistency rules (§6). **Never hard-code a hex**
   — consume tokens.
5. **`PRODUCT.md`** — *who it's for and why.* Take away the persona (the struggling first-year, §2),
   the seven design principles (§4), the anti-references (§3 — no gamification, no glossy viz, no
   marketing polish), and the accessibility commitments (§7). Every sim must move the learner through
   **Orient → Intuition → Problem-solving** (§1).

You should also read the **`CLAUDE.md`** of the module you are about to copy (`Module2/CLAUDE.md`
for Case A, `Module1/CLAUDE.md` for Case B). Those files hold hard-won, module-specific gotchas
(the disposal contract, the rotation hierarchy, the `ZXY` Euler order, the no-transform invariant)
that the root docs summarize but the CLAUDE.md states operationally.

---

## Section 2: Which Case Are You?

Decide this **before** you create a folder. The case determines your template.

| Case | You are building… | Template to copy | Example |
|---|---|---|---|
| **A** | A new **3D-solids topic** in the Module 2 family | **`Module2/`** (the master) | "Sectional Views", "Auxiliary Projections" |
| **B** | A new **drawing-foundations lesson** in the Module 1 family | **`Module1/`** (add a thin page) | "Conics", "Development of Surfaces" |
| **C** | A whole **new subject module** (new discipline) | *(none — build fresh from `../CLAUDE.module-template.md` + `../PLATFORM-RULES.md`; Module 2/Module 1 are reference examples only, Section 5.1)* | Mechanical, Electrical, Civil |

**Case A — New topic within the Module 2 family.** Same subject (Engineering Graphics, projection
of 3D solids), new sub-topic. You copy the whole master and *simplify down* for the topic, gating
content with the single `ENABLED_TIERS` flag in `src/problems.js` (ADR-009, RULES.md §1.6). The
geometry engine, the rebuild pipeline, the design tokens, and the platform contract all stay; you
adapt the data layer, the stepper sequence, the controls, and the copy. The two existing examples
bracket the range: **Topic 2 (Simple Positions)** is a *near-faithful* clone (9 of 18 `src/` files
byte-identical), and **Topic 1 (Introduction)** is a *heavy* adaptation (drops the whole
projection/stepper/problem layer, adds `anatomy.js` + `gallery.js`) (ARCHITECTURE.md §2, §8).

**Case B — New topic within the Module 1 family.** Same foundations subject, new lesson. You do
**not** copy a whole folder — Module 1 is one shared engine serving seven thin pages, so a new
lesson is **a new thin HTML page + a small orchestrator `*.js` + pure data files**, and you **never
edit `engine.js`** to add it (ADR-011, RULES.md §3.28). This is structurally different from Case A.

**Case C — A whole new subject module.** A new discipline (Mechanical, Electrical, Civil, CS).
Unlike Case A/B, you do **not** copy `Module2/` or `Module1/` — those are Engineering Graphics'
own codebases, and copying one would drag in its domain-specific engine files (shape generators,
projection drawer, problem library) and a `CLAUDE.md` that points at the Engineering-Graphics-only
root `ARCHITECTURE.md`/`DECISIONS.md`/`RULES.md`. Instead you start from
`../CLAUDE.module-template.md` + `../PLATFORM-RULES.md` and build your own architecture, deciding
2D vs 3D as your own pattern choice (Section 5.1). You write your own `ARCHITECTURE.md`,
`DECISIONS.md`, and `RULES.md` before development starts (Section 5.4) — they are new, local
files, not entries in the root ones.

---

## Section 3: Case A Step-by-Step — New Module 2 Topic

> Worked example throughout: a new topic **"Sectional Views"** as the third Module 2 topic.

### 3.1 Name the folder

Follow the as-built convention (derived from `graphics_module_2_topic_1_introduction` /
`graphics_module_2_topic_2_simple_positions`):

```
graphics_module_2_topic_<K>_<slug>
```

`<K>` is the next host-catalog index (here `3`); `<slug>` is the lowercase, underscore-separated
topic name. **Worked example:** `graphics_module_2_topic_3_sectional_views`.

> ⚠️ The `topic_<K>` number is the **host catalog order, not** a claim about the master (RULES.md
> §1.7, ADR-020). Do not read lineage from it. The human-facing title lives in `meta.json`, and a
> topic title may carry no number at all (e.g. "Simple Positions", RULES.md §1.9).

### 3.2 Copy the master, whole

From the Simatrix root:

```powershell
# PowerShell (primary shell on this machine)
Copy-Item -Recurse Module2 graphics_module_2_topic_3_sectional_views
```
```bash
# Git Bash equivalent
cp -r Module2 graphics_module_2_topic_3_sectional_views
```

Then **delete the master's own git/scratch metadata** from the copy so it doesn't inherit Module 2's
history: remove the copied `.git/`, `.claude/`, and `.impeccable/` folders and `CHANGELOG.md`
(start the topic's changelog fresh). Keep `assets/`, `index.html`, `main.js`, `meta.json`, `CLAUDE.md`,
and the entire `src/` tree.

### 3.3 File-by-file: keep exactly as copied (the shared contracts)

These were confirmed **byte-identical** between `Module2/src/` and
`graphics_module_2_topic_2_simple_positions/src/` (md5 match, 2026-06-28). They are the shared
engine; copy them and **do not touch them** in the topic. If one needs a fix, fix it in `Module2/`
and re-copy (RULES.md §1.3, §1.4):

| File | Why it must stay identical |
|---|---|
| `src/anim.js` | The tween + easing engine — byte-identical across **Module 1, Module 2, and topic copies** (the single most-shared file). RULES.md §7.1. |
| `src/cube.js` | Cube/box generator. Byte-identical across **all three** M2-family folders. RULES.md §7.2. |
| `src/cone.js` | Cone generator. Identical across all three. RULES.md §7.2. |
| `src/cylinder.js` | Cylinder generator. Identical across all three. RULES.md §7.2. |
| `src/genericPrism.js` | N-sided prism factory. Identical across all three. RULES.md §7.2. |
| `src/genericPyramid.js` | N-sided pyramid factory. Identical across all three. RULES.md §7.2. |
| `src/genericSolid.js` | Pure polygon trigonometry — the one file sibling shapes may import. Identical across all three. RULES.md §7.2, ADR-007. |
| `src/meshAnalyzer.js` | Edge-welding analyzer. Identical M2 ↔ topic 2. (Keep only if your topic draws projections.) |
| `src/vertexLabeler.js` | Vertex/axis annotation layer. Identical M2 ↔ topic 2. (Keep only if your topic labels geometry.) |

> Fonts are no longer bundled per-module (ADR-086) — every codebase's `@font-face` block points at
> the same Supabase Storage CDN URLs, so there is no `assets/fonts/` to copy for a new topic (see
> Section 3.8).

### 3.4 File-by-file: adapt (the topic-specific content)

These **diverged** between `Module2/src/` and topic 2's `src/`. Copy them, then change only the
topic-specific parts. What "adapt" concretely means is taken from how topic 2 actually differs:

| File | What you adapt |
|---|---|
| `src/shapeData.js` | The `ShapeData` field set + defaults. **Concretely:** topic 2 *removed* the `angleHP`/`angleVP` inclination fields and rewrote the JSDoc to state the "simple position" restriction, keeping only the `restingPlane` choice. Your topic keeps whatever fields it teaches and deletes the rest. |
| `src/problems.js` | The **`ENABLED_TIERS` flag** — the single switch that scopes a clone (ADR-009, RULES.md §1.6). **Concretely:** Module 2 = `['base','corner-edge','one-plane','both-planes']`; topic 2 narrowed it to `['base','corner-edge','axis-vp']`. Set yours to the tiers your topic can actually solve; add/curate `PROBLEMS` to match (keep textbook wording verbatim — RULES.md §6.7). |
| `src/iShape.js` | The shape-generator contract + `applyShapeTransform()`. **⚠️ This is NOT a copy-identical file** — Module 2's is larger (it imports THREE and carries the inclination / VP-lay-down composition) and the two topics share an older, smaller version. Adapt the transform to the poses your topic actually uses; keep the explicit **`ZXY` Euler order** and re-derive every sign visually (ADR-005, RULES.md §3.8–§3.10). |
| `src/uiManager.js` | The parameter dock. Remove sliders/toggles for fields you deleted, and remove the matching mutual-exclusion wiring (e.g. topic 2 dropped the inclination toggles, ADR-008 consequence). |
| `src/stepper.js` | The Guided Stepper sequence — the steps your topic teaches, gated one behind the next. |
| `src/problemLibrary.js` | Self-check targets/labels for your problem set. Keep it ±0.5-tolerant and **never auto-fill** (ADR-015, RULES.md §6.1–§6.2). |
| `src/projectionDrawer.js` | Only if your topic changes how projections are drawn. (Topic 2's differs slightly; keep the ADR-016 line conventions — RULES.md §6.16–§6.18.) |
| `src/terms.js` | The inline glossary entries for your topic's vocabulary. |
| `src/onboarding.js` | Empty-state copy and spotlight chips, adapted to your first step. |
| `index.html` | **The `<title>`, the `<meta name="description">`, and the control markup.** Tokens, the import map, and the `@font-face` block (CDN-hosted, ADR-086) are **identical** between Module 2 and the topics — leave them. Topic 2 stripped the inclination controls from the markup; you strip/keep controls to match your `shapeData`/`uiManager`. ⚠️ **Update the `<title>`** — topic 2 left its `<title>` reading "Orthographic Projection of Solids" even though its `meta.json` title is "Simple Positions" (a real, shipped inconsistency — do not repeat it). |
| `main.js` | The imports and the rebuild wiring. **Concretely:** topic 2 dropped the `import { slantAngle }` line because it removed inclination; topic 1 dropped seven imports and added two. Import only the leaf modules your topic actually uses, and keep the single `rebuild()` pipeline and the single `simAPI.reset()` path (ADR-004, ADR-002, RULES.md §3.1, §2.9). |

### 3.5 File-by-file: create fresh (only if your topic needs them)

A near-faithful clone (like topic 2) creates **no** new `src/` files. A heavy adaptation creates
topic-unique leaves — as topic 1 did with **`src/anatomy.js`** (the per-shape facts data) and
**`src/gallery.js`** (the gallery controller) when it dropped the projection layer. If your topic
introduces a genuinely new behavior, add a new single-purpose leaf module; it must **not** import
sibling leaves (only `genericSolid.js` may be imported by siblings — ADR-007, RULES.md §3.6).

### 3.6 Update `meta.json` (every field)

The platform reads these four fields and **rejects an upload missing any** (ADR-002, RULES.md §2.11):

| Field | What to put |
|---|---|
| `title` | The human-facing topic name (e.g. `"Sectional Views"`). This is the catalog title; it may carry no topic number (RULES.md §1.9). |
| `description` | One or two sentences on what the learner does and sees. Follow the existing examples' shape (Module 2: "Visualize how 3D solids project onto the Horizontal (HP) and Vertical (VP) planes…"). |
| `difficulty` | One of `"beginner"` / `"intermediate"` / `"advanced"` — **lowercase only**; the backend rejects a capitalised value (PLATFORM-RULES.md §1.11a). |
| `tags` | A JSON array of lowercase hyphenated tags, e.g. `["engineering-graphics","orthographic-projection","solids","sectional-views","hp-vp"]`. |

### 3.7 Update the new folder's `CLAUDE.md` (the pointer to root docs)

Edit the copied `CLAUDE.md` so it describes *this topic* and points at the root docs:

1. Rewrite the H1 and the opening paragraph for your topic (scope, what's in/out).
2. Keep the **"Project-wide documentation"** block that points to `../ARCHITECTURE.md`,
   `../DECISIONS.md`, `../RULES.md`, `../DESIGN.md`, `../PRODUCT.md` (all five topic CLAUDE.md files
   carry this block as of 2026-06-28).
3. **Point the "Design system rules" line at `../DESIGN.md` and `../PRODUCT.md`** (the single root
   copies, ADR-022/ADR-023) — **do not** copy a local `DESIGN.md`/`PRODUCT.md` into the topic.
   *(Note the residual inconsistency you are avoiding: topic 2's body still says local `@DESIGN.md`
   while its top block correctly says `../DESIGN.md` — make yours consistent, root-pointing.)*
4. If you inherited Module 2 sections that don't apply to your topic, mark them not-applicable the
   way topic 1 does ("Sections inherited from the projection module … do not apply to this module").

### 3.8 Import-map and font checks

- **Import map:** confirm `index.html` still pins **`three@0.160.0`** from jsDelivr for both `three`
  and `three/addons/` — byte-identical to the master's map. Never use `@latest`, the UMD global, or
  `npm install three` (ADR-001, RULES.md §2.2–§2.3). Every local import must keep its **`.js`
  extension** and stay relative (`./src/x.js`) (RULES.md §2.4–§2.5).
- **Fonts:** confirm the `@font-face` block points at the Supabase Storage CDN (ADR-086) — the
  same URLs, byte-identical, across the whole family. There is no `assets/fonts/` to add anymore;
  never point at a Google-Fonts CDN or any other third-party font host (RULES.md §2.15,
  DESIGN.md §3.1).

### 3.9 Serve and verify it runs *before* adding content

Verify the **empty copied base boots clean** before you change a thing — that isolates copy mistakes
from content mistakes.

1. Serve over HTTP via **XAMPP Apache on port 8080** (port 80 is held by Windows IIS and 404s):
   open `http://localhost:8080/Simatrix/graphics_module_2_topic_3_sectional_views/` (ADR-001,
   RULES.md §2.6). `file://` will not work (ES-module CORS).
2. **Hard-reload** before judging anything — Apache sends no `Cache-Control`, so Chrome serves stale
   modules (ADR-001, RULES.md §2.7).
3. Confirm: the empty reference planes render, no console errors, `window.simAPI` exposes
   `pause`/`resume`/`reset`, and the mobile notice appears below 768px.
4. For a real green check, **verify the shipped module headlessly** by driving Chrome over the
   DevTools Protocol with Node's **built-in** `WebSocket`/`fetch` — disable the network cache
   (`Network.setCacheDisabled`) and **never** install puppeteer/playwright (ADR-019, RULES.md
   §2.17–§2.19). Verify the **real file**, never a hand-typed replica (RULES.md §2.19). Confirm
   `renderer.info.memory` (geometry + texture counts) stays flat across 50 rapid regenerations
   (ADR-004, RULES.md §3.4).

### 3.10 Register the topic in `ARCHITECTURE.md`

Add the new folder to **ARCHITECTURE.md §2** (the codebase map), describing it as a deployed copy of
Module 2 and how heavily it is adapted (RULES.md §8.3). If it introduced or diverged any
shared/identical file, update **§7** (shared) accordingly. Add a dated entry to the root
`CHANGELOG.md` (RULES.md §8.2), and if you made any non-obvious two-option decision, add an ADR to
`DECISIONS.md` (RULES.md §8.1).

---

## Section 4: Case B Step-by-Step — New Module 1 Topic

> Module 1 is a **different architecture** from Module 2 and you must respect it (ADR-011, RULES.md
> §7.5, §7.7). The three structural differences to keep in mind the whole time:
> - **One shared `engine.js`** serves all pages — a new lesson is a new page, **never** an engine edit.
> - **CSS lives in `src/shell.css`**, not inline in the HTML (Module 2 keeps CSS inline).
> - **Multi-page:** seven thin HTML shells, each a tiny orchestrator that calls `initSim(config)`.

> Worked example: a new lesson **"Conics"** as the eighth page.

### 4.1 Name the page and its files

Module 1 pages are named by lesson, not by number:
`<lesson>.html` + `<lesson>.js` + `src/<lesson>Steps.js` (+ a data file if needed). **Worked
example:** `conics.html`, `conics.js`, `src/conicsSteps.js`, `src/conicData.js`.

### 4.2 Create the thin page (do not copy a whole folder)

The unit of work is a page, not a folder. Build it by mirroring an existing thin page of the same
mode:

- For a single-window teaching lesson, copy the **`linetypes.html` / `linetypes.js`** pair
  (`mode:'single'`).
- For a sim with the on-demand Compare card, copy the **`points.html` / `main.js`** pair
  (`mode:'dual'`).

### 4.3 File-by-file: keep exactly as copied (Module 1's shared contracts)

| File | Why it must stay identical |
|---|---|
| `src/engine.js` | **The shared engine.** It owns the renderer, the stepper, the Compare View, the fold, the rebuild pipeline, and `window.simAPI`. **Never edit it to add a lesson** (ADR-011, RULES.md §3.28). A new lesson supplies *data*, not engine changes. |
| `src/shell.css` | The shared chrome + `:root` tokens + `@font-face` (CDN-hosted, ADR-086). Add only a small page-specific inline `<style>` in your shell if truly needed (as Lines/Dimensioning do); never re-define a shared token (RULES.md §4.16). |
| `src/anim.js` | Byte-identical to Module 2's tween engine — leave it. |
| `src/chrome.js`, `src/onboarding.js`, `src/problemLibrary.js` | Shared leaf modules the engine injects/uses. Leave them. |

> Module 1's `@font-face` lives in `src/shell.css`, one level down from the page — but since
> ADR-086 moved every `src:` URL to the absolute Supabase Storage CDN, that path difference no
> longer applies: Module 1's block is now byte-identical to Module 2's (DESIGN.md §3.1). Don't
> re-introduce a relative `../assets/fonts/…` path here.

### 4.4 File-by-file: create fresh (your lesson's data)

A Module 1 lesson is almost entirely **pure data** passed into `initSim()`:

| New file | What it contains |
|---|---|
| `<lesson>.html` | A thin shell: links `./src/shell.css`, holds the `#step-card`/`#step-rail`/`#controls` markup + the viewport ids, and loads `<lesson>.js`. |
| `<lesson>.js` | A small orchestrator: imports `engine.js` + its data files, defines `draw3D` (and `draw2D`/`buildAnimScene` if the lesson folds), and calls `initSim({ mode, steps, terms, defaultData, draw3D, … })`. |
| `src/<lesson>Steps.js` | Pure data: the `STEPS[]` rail sequence + the `TERMS` inline glossary. |
| `src/<lesson>Data.js` | Pure data: the lesson's geometry/state model + its `resolve`/default helpers (only if it can't reuse `pointData.js`/`partData.js`). |

### 4.5 Adapt: wire the lesson in

- Add your lesson's tab to the **`.chapnav`** seven-tab switcher markup that every page carries, and
  set the page's `chap` config value so its tab shows active.
- If the lesson needs an extra color, declare it as a **token** in `shell.css` `:root` and pass it
  via `cfg.tokens` — never inline a hex (RULES.md §4.3, ADR-003).

### 4.6 meta.json, CLAUDE.md, verify, register

- `meta.json` is **module-wide** in Module 1 (one file covers all pages) — extend its `description`
  and `tags` to mention the new lesson; the four-field contract still holds (RULES.md §2.11).
- Update `Module1/CLAUDE.md`'s file-structure list and lesson list to include the new page.
- Serve at `http://localhost:8080/Simatrix/Module1/<lesson>.html`, hard-reload, verify clean boot,
  flat memory across 50 rebuilds, the disposal contract removing CSS2D label DOM nodes (RULES.md
  §3.5), and `simAPI` working. Headless-verify per ADR-019.
- Register in `ARCHITECTURE.md §4` (Module 1 breakdown) and the root + `Module1/CHANGELOG.md`.

---

## Section 5: Case C Step-by-Step — New Subject Module

> **Revised 2026-07-02.** A new discipline (Mechanical, Electrical, Civil, CS) does not follow the
> Engineering Graphics master/deploy model (Sections 3–4 above) — it is not a copy of `Module2/` or
> `Module1/`, and it does not share the root `ARCHITECTURE.md`/`DECISIONS.md`/`RULES.md`. It shares
> only the platform-wide layer (`DESIGN.md`, `PRODUCT.md`, `PLATFORM-RULES.md`) and builds
> everything else fresh, per `CLAUDE.module-template.md`. If you expected to copy `Module2/` or
> `Module1/` wholesale here, that was the old guidance — this section supersedes it.

### 5.1 Decide your architecture pattern: 3D orchestrator or 2D multi-lesson?

This is the same underlying question Case A/B answer for you by construction — now it's yours to
decide and record:

- **Does the subject manipulate 3D geometry** (solids, mechanisms, 3D fields)? A single
  orchestrator — owns the scene, the camera, one `rebuild()` pipeline, `window.simAPI` — with
  single-purpose leaf modules hanging off it is a proven fit; `Module2/main.js` demonstrates the
  pattern. **You are not copying `Module2/`** — build your own orchestrator, using it only as a
  *reference example*.
- **Is it a sequence of 2D-drawing / diagram lessons** (circuits, free-body diagrams, plans)? A
  shared engine serving several thin lesson pages is a proven fit; `Module1/src/engine.js`
  demonstrates the pattern. Same caveat — reference example, not a copy source.
- If your subject fits neither cleanly, that is itself a decision to make and record in your own
  `DECISIONS.md` (Section 5.4) — don't force-fit it.

Record which pattern you chose and why as the first entry in your own `DECISIONS.md`.

### 5.2 Build the platform skeleton fresh

Do not copy the `Module2/` or `Module1/` folder. Build a new folder containing only the
platform-level pieces every Simatrix sim needs — all documented in `../PLATFORM-RULES.md` §1
(Platform & Runtime Contract):

- The import map, pinned to an exact version of whatever library you depend on (no UMD global, no
  `@latest`).
- `window.simAPI` exposing `pause()`, `resume()`, `reset()`.
- `meta.json` with all four required fields.
- The dismissible mobile notice below 768px.
- The CDN-hosted fonts (Atkinson Hyperlegible + IBM Plex Mono, served from Supabase Storage —
  ADR-086) — the same `@font-face` block, unchanged, from any existing module; they are the
  platform's own shared typography, not Engineering-Graphics content.
- `../CLAUDE.module-template.md`, copied in as your `CLAUDE.md` and filled in per its own
  instructions.

If it's faster to start by copying `Module2/index.html` or a `Module1/` page purely as boilerplate
for the import map / `simAPI` wiring, that's fine — but then **delete** everything
domain-specific: the shape generators, `problems.js`, `problemLibrary.js`, `iShape.js`,
`meshAnalyzer.js`, the Engineering Graphics content in `stepper.js`/`terms.js`/`onboarding.js`, and
the copied `CLAUDE.md`. Never keep a `CLAUDE.md` that still points at the root
`ARCHITECTURE.md`/`DECISIONS.md`/`RULES.md` — replace it with the filled-in template.

### 5.3 Build fresh: your own domain engine

There is no shared geometry/rendering engine to inherit. Module 2's shape generators (`cube.js`,
`cone.js`, `iShape.js`, `applyShapeTransform()`) and Module 1's drawing helper toolkit (`asg`,
`alp`, `acr`, `alb`, …) solve Engineering Graphics' own problems — orthographic projection of
solids, flat technical drawing — and are not a contract your subject inherits. Study them as
worked examples if useful (the disposal-contract discipline, the single-rebuild-pipeline
discipline, and "no leaf module imports a sibling" are good ideas worth re-implementing), but
build your own generators/helpers for your own domain.

Either way: respect the platform's shared visual rules in your new domain's viewport — Two-Cue,
Chrome-Only Blue, Flat-Ink, and the rest (`PLATFORM-RULES.md` §2). Add any new **domain-specific
color tokens** (what a dashed vs. solid line means in your subject, etc.) to your own module's
design-doc appendix — never by re-defining a shared root token (`PLATFORM-RULES.md` §2.16).

### 5.4 Write your own ARCHITECTURE.md, DECISIONS.md, and RULES.md — before you write code

Unlike Case A/B, these are **not** the shared root files — they are new files local to your
module, per `CLAUDE.module-template.md`'s "Before you write any code" section:

- **`ARCHITECTURE.md`** — the map of your own file structure and data flow. Model its shape on the
  root `ARCHITECTURE.md` (plain-language map, codebase tree, component breakdown) but scoped to
  your module only.
- **`DECISIONS.md`** — start your own ADR numbering at `ADR-001` (do not continue the root file's
  numbering — that sequence belongs to Engineering Graphics). Record, at minimum: which
  architecture pattern you chose and why (5.1), your domain engine's design (5.3), and your own
  folder-naming scheme for any sub-topics your subject grows — the `graphics_module_<M>_topic_<K>`
  convention (ADR-024) is Engineering Graphics' own naming; pick and record your own.
- **`RULES.md`** — write it **on top of `../PLATFORM-RULES.md`** as the stated foundation: don't
  restate the platform rules, add your own subject-specific ✅ DO / ❌ NEVER rules underneath them,
  each citing the ADR that justifies it (same discipline `PLATFORM-RULES.md` §4 describes).

### 5.5 Verify and register

- Serve over port 8080, hard-reload before judging anything, and confirm the platform contract:
  `simAPI` exposes `pause`/`resume`/`reset`, `meta.json` has all four fields, the sim self-starts,
  and the mobile notice appears below 768px (`PLATFORM-RULES.md` §1).
- Add a **one-line pointer entry** for your new subject to the root `ARCHITECTURE.md` §2 (Codebase
  Map) — a directory-tree line plus "see its own `ARCHITECTURE.md`," the same way each Engineering
  Graphics topic gets one line there. This pointer is the only content of yours that belongs in a
  root document.
- Add a one-time entry to the root `CHANGELOG.md` noting the new subject's creation. From then on,
  your day-to-day changes go in **your own** `CHANGELOG.md` inside your module folder — the root
  `CHANGELOG.md`'s own header already says per-module changelogs live inside each module folder.

---

## Section 6: Files That Must Never Be Modified After Copying

These were verified **byte-identical** by `md5sum` on 2026-06-28 between `Module2/src/` and
`graphics_module_2_topic_2_simple_positions/src/` (and, where noted, across the whole family). They
are the shared contracts: a fix belongs in `Module2/` and must be re-copied to every topic
(RULES.md §1.3, §1.4). **Never edit a copy in place** — that is how the copies drift (ARCHITECTURE.md
§9.2, RULES.md §1.8).

| File | Reason it must stay identical | What breaks if it drifts |
|---|---|---|
| `src/anim.js` | The one tween + easing engine; byte-identical across **Module 1, Module 2, and topic 2** (RULES.md §7.1). | Fold/draw-on/auto-zoom timing diverges between modules; reduced-motion snapping stops matching. |
| `src/cube.js` | Cube generator; identical across **M2, topic 1, topic 2** (RULES.md §7.2). | A re-derived sign or Euler change yields plausible-but-wrong (mirrored) geometry (ADR-005). |
| `src/cone.js` | Cone generator; identical across all three. | Same as above; curved-rim welding assumptions break. |
| `src/cylinder.js` | Cylinder generator; identical across all three. | Same as above. |
| `src/genericPrism.js` | N-sided prism factory; identical across all three. | Per-shape preset poses (e.g. orient angles) silently diverge. |
| `src/genericPyramid.js` | N-sided pyramid factory; identical across all three. | "Flat edge faces camera" alignment breaks; tilt pivots about the wrong feature. |
| `src/genericSolid.js` | Pure polygon trig; the **only** file siblings may import (ADR-007). Identical across all three. | Apothem/slant math diverges; every prism/pyramid in that copy is subtly wrong. |
| `src/meshAnalyzer.js` | Edge-welding analyzer; identical M2 ↔ topic 2. | Without the `1e-3` weld tolerance staying in sync, curved-solid rims render as double lines (ADR-006). |
| `src/vertexLabeler.js` | Vertex/axis annotation layer; identical M2 ↔ topic 2. | Labels (A,B,C…/apex O/chain-line axis) drift from the projection geometry. |
| `@font-face` Supabase CDN URLs (×3 faces) | The same CDN-hosted fonts, byte-identical across **all four** codebases (ADR-086 — no more local `assets/fonts/*.woff2`). | Legibility-first typography contract breaks; on a network failure the fallback is the system font until/unless the CDN fetch resolves. |

**Explicitly NOT in this list — copy, then adapt** (they diverged between M2 and topic 2, by design):
`iShape.js`, `onboarding.js`, `problemLibrary.js`, `problems.js`, `projectionDrawer.js`,
`shapeData.js`, `stepper.js`, `terms.js`, `uiManager.js`, plus `index.html`, `main.js`, `meta.json`.

> ⚠️ **`iShape.js` is a trap.** It looks like a shared contract, but Module 2's version (larger;
> imports THREE; carries the `restingPlane:'VP'` lay-down + inclination composition) is **not**
> identical to the topics' smaller version — and the change was never back-copied. Treat `iShape.js`
> as **adapt**, not copy-identical, and verify which `applyShapeTransform` behavior your topic needs.

---

## Section 7: First Development Session — Recommended Order

> **Case A/B only.** This order follows Engineering Graphics' own `rebuild()` pipeline and file set
> (`shapeData.js`, `problems.js`, `uiManager.js`, `stepper.js`, …). For Case C, follow the same
> *spirit* — get an empty, contract-compliant skeleton green before adding content, then build your
> data layer before your controls before your guided sequence — substituting your own files (see
> Section 5).

Build in the order the data actually flows through `rebuild()` (ARCHITECTURE.md §5), so each layer is
verifiable before the next depends on it. This mirrors how topic 2 was cut from the master (ADR-009)
and the Orient → Intuition → Problem-solving arc (PRODUCT.md §1).

1. **Get the copied base green first** (Section 3.9). Empty scene boots, no console errors, flat
   memory, `simAPI` works. Don't add content until this passes.
2. **Identity & contract:** `meta.json` (all four fields), `index.html` `<title>` + `<meta
   description>`, and the `CLAUDE.md` root-doc pointers (Sections 3.6–3.7). Cheap, and it stops the
   topic-2 `<title>` mistake from shipping.
3. **Data layer:** `shapeData.js` (the field set + defaults) — the single bag of numbers `rebuild()`
   consumes. Decide what your topic teaches and delete the rest.
4. **The scope switch:** `problems.js` `ENABLED_TIERS` (ADR-009, RULES.md §1.6). Flip it before
   touching UI so the library and stepper agree on what's in scope.
5. **The pipeline glue:** `main.js` imports + `iShape.js` `applyShapeTransform` for the poses you
   kept; confirm a solid still rebuilds through the single `rebuild()` path (ADR-004).
6. **Controls:** `uiManager.js` — expose only the sliders/toggles for surviving fields; remove
   orphaned mutual-exclusion wiring (ADR-008 consequence).
7. **Sequence:** `stepper.js` — the guided steps your topic teaches, each gated behind the previous
   (PRODUCT.md §1, one idea per step).
8. **Content & copy:** `terms.js`, `onboarding.js`, the `PROBLEMS` set + `problemLibrary.js` targets
   (±0.5, never auto-fill — ADR-015), keeping textbook wording verbatim (RULES.md §6.7).
9. **Re-verify after each layer:** hard-reload + the 50-rebuild memory check; headless green check on
   the shipped module before calling a layer done (ADR-019).
10. **Register:** ARCHITECTURE.md §2, root CHANGELOG.md, and any ADR for non-obvious choices.

---

## Section 8: Verification Checklist Before Calling It Done

> **Case A/B only — this checklist cites the shared root `RULES.md`/`ARCHITECTURE.md` by their
> Engineering-Graphics-specific section numbers.** For Case C, build the equivalent checklist
> against `PLATFORM-RULES.md` and your own `RULES.md`/`ARCHITECTURE.md` instead — `PLATFORM-RULES.md`
> §5 is its own quick anti-pattern scan.

**Visual (against DESIGN.md token values):**
- [ ] No hard-coded hex anywhere in JS or component CSS; all colors read from `--color-*` tokens at
      runtime (DESIGN.md §6.2, RULES.md §4.1–§4.2). The only sanctioned exception is a pre-CSS boot
      diagnostic, if your template has one (DESIGN.md §8.4).
- [ ] Blue accent ≤ ~10% of chrome; **no blue linework inside the viewport** (Quiet Chrome +
      Chrome-Only Blue, DESIGN.md §2.3, RULES.md §4.4–§4.5).
- [ ] Every color signal paired with a second cue — dash/weight/label/icon/shape (Two-Cue, RULES.md §4.6).
- [ ] Type hierarchy from size + 700 bold only (no 500/600); every live numeric in IBM Plex Mono
      `tabular-nums` (Two-Weight + Tabular, RULES.md §4.7–§4.8).
- [ ] No shadow on rendered geometry; structure via 1px hairline + tonal layering; no bare
      `#000`/`#fff` except the scoped `--color-host-white` (Flat-Ink / Border-Over-Shadow / White
      Exception, RULES.md §4.9–§4.11).

**Behavioral (against RULES.md):**
- [ ] Every geometry change routes through the single `rebuild()` pipeline; no control mutates the
      scene directly (RULES.md §3.1–§3.2).
- [ ] Disposal contract runs at the start of each rebuild; `renderer.info.memory` flat across 50
      regenerations; CSS2D label DOM nodes removed in disposal (RULES.md §3.3–§3.5).
- [ ] `euler.order` is explicitly `ZXY`; ported signs re-derived visually (RULES.md §3.8–§3.10).
- [ ] Fat lines (`LineSegments2`/`Line2`) for all linework; `computeLineDistances()` on dashed lines;
      `polygonOffset:true` on the solid; `LineMaterial.resolution` synced on resize (RULES.md §3.12–§3.18).
- [ ] No superseded design "restored": fold camera moves, 2D projectors solid, pentagonal preset 54°,
      Lines 5-step stepper — don't "fix" these back (RULES.md §8.6).

**Platform contract:**
- [ ] `window.simAPI` exposes exactly `pause()`/`resume()`/`reset()`; the in-sim Reset is the **only**
      reset path through `simAPI.reset()` (RULES.md §2.8–§2.9).
- [ ] No `postMessage`/`window.parent`/`window.top`; no runtime network calls beyond the one CDN
      fetch (RULES.md §2.10, §2.12).
- [ ] `meta.json` has all four fields (`title`, `description`, `difficulty`, `tags`) (RULES.md §2.11).
- [ ] Dismissible "Best experienced on desktop" notice below 768px — never blocks the sim (RULES.md
      §2.13). *(Match the platform wording exactly — Module 1's wording diverges and is a flagged
      drift, PRODUCT.md §7/§8.)*
- [ ] Self-starting on load; import map pins `three@0.160.0`; `.js` extensions; relative paths
      (RULES.md §2.3–§2.6, §2.14).

**Cross-module consistency (ARCHITECTURE.md §7):**
- [ ] The Section 6 byte-identical files were copied unchanged (re-run `md5sum` against `Module2/src/`
      to confirm) (RULES.md §7.1–§7.2).
- [ ] Consumes the single root `DESIGN.md` / `PRODUCT.md`; no re-introduced per-topic copies; no
      re-defined shared tokens (RULES.md §4.15–§4.16, §7.3–§7.4).

**Accessibility (PRODUCT.md §7):**
- [ ] Every control keyboard-reachable with a visible focus halo; ≥44px targets (RULES.md §4.12).
- [ ] `prefers-reduced-motion` collapses all motion to instant; state still updates to the end
      (RULES.md §4.13).
- [ ] Sliders carry `aria-valuetext`; a live region announces step/mode changes; the viewport result
      is mirrored as readable text (PRODUCT.md §7).
- [ ] Re-render after `document.fonts.ready` so CSS2D labels don't paint in a fallback font (RULES.md §3.26).

---

## Section 9: Common Mistakes (new-topic-setup-specific)

> **Case A/B only — these are Engineering-Graphics-specific setup traps** (the master/deploy copy
> model, the `iShape.js` trap, `topic_N` numbering). For Case C's subject-agnostic anti-pattern
> scan, see `PLATFORM-RULES.md` §5.

These are the mistakes that specifically bite when **standing up a new topic from a copy** — drawn
from RULES.md §9, both module `CLAUDE.md` files, and the actual divergences found in the two existing
topics. (General development anti-patterns live in RULES.md §9; this list is only the setup traps.)

- **Copying from a topic instead of the master.** Always copy `Module2/` for Case A/C, never a
  `graphics_module_2_topic_*` folder — the topics are already scoped-down and some carry stale shared
  files (RULES.md §1.1, §1.3).
- **Editing a "shared" file in the topic.** Fix it in `Module2/` and re-copy; a topic-local edit to
  `anim.js`/`genericSolid.js`/a generator silently forks the platform (RULES.md §1.3–§1.4).
- **Assuming the copies are already in sync.** They drift — `iShape.js` is already out of sync
  between the master and the topics. Verify with `md5sum`, don't assume (RULES.md §1.8).
- **Treating `iShape.js` as copy-identical.** It is **not** (Section 6 trap; ADR-027, RULES.md
  §1.13). It carries topic-specific pose logic (the VP lay-down + inclination) and already differs
  between the master and the topics. Read it and adapt its `applyShapeTransform` to the poses your
  topic uses, keeping `ZXY` (ADR-005) — never copy it blindly.
- **Leaving the `<title>` stale.** The `index.html` `<title>` must match `meta.json.title` — it is
  the browser-tab text and the page's screen-reader accessible name (ADR-026, RULES.md §1.12). As a
  historical example, fixed 2026-06-28: Topic 2 had shipped with `<title>Orthographic Projection of
  Solids</title>` while its `meta.json` says "Simple Positions"; the `<title>` now reads "Simple
  Positions" to match. Keep the two consistent on every copy and don't repeat the mistake.
- **Reintroducing per-topic `DESIGN.md`/`PRODUCT.md`.** New topics must consume the single root
  copies (ADR-028, building on ADR-022/ADR-023; RULES.md §1.14); don't copy local design/product docs
  into the new folder, and point the CLAUDE.md design line at `../DESIGN.md`/`../PRODUCT.md` (not a
  local `@DESIGN.md`).
- **Reading lineage from the `topic_N` number.** The number is host-catalog order, not a master
  pointer; topic 1's own CLAUDE.md even mislabels the master as "Topic 2" (RULES.md §1.7, ADR-020).
- **Hard-coding a hex while adapting the viewport.** Declare a token and read it at runtime; adapting
  controls is exactly when stray literals creep in (RULES.md §4.1–§4.3).
- **Adding `package.json`/a bundler, an unpinned `three`, or extensionless/absolute imports** while
  "modernizing" the copy. All banned (RULES.md §2.1–§2.5).
- **Creating a second reset path** when you rewire `main.js` — the in-sim Reset must route through
  `simAPI.reset()` only (RULES.md §2.9).
- **Letting a new leaf module import a sibling.** Only `genericSolid.js` may be imported by siblings;
  everything else hangs off the orchestrator (RULES.md §3.6, ADR-007).
- **Forgetting the disposal contract / CSS2D node removal** after trimming `main.js` — WebGL context
  exhaustion is the most likely late-stage bug (RULES.md §3.3, §3.5; Module 2 CLAUDE.md).
- **(Case B) Editing `engine.js` to add a Module 1 lesson.** A lesson is a new thin page + data; the
  engine change "lands once" precisely because lessons don't touch it (RULES.md §3.28, ADR-011).
- **(Case B) Re-defining a shared token in a page's inline `<style>`** instead of `shell.css`
  `:root` + `cfg.tokens` (RULES.md §4.16).

---

*Built on 2026-06-28 by reading `ARCHITECTURE.md`, `DECISIONS.md`, `RULES.md`, `DESIGN.md`,
`PRODUCT.md`, both module `CLAUDE.md` files, and the live `Module2/` · `Module1/` ·
`graphics_module_2_topic_1_introduction/` · `graphics_module_2_topic_2_simple_positions/` codebases.
Byte-identical claims verified with `md5sum`. Module 2 is the master — start there for Case A.*

*Section 5 (Case C) revised 2026-07-02 to reflect `PLATFORM-RULES.md` and
`CLAUDE.module-template.md`: a new subject module no longer copies `Module2/`/`Module1/` or shares
the root `ARCHITECTURE.md`/`DECISIONS.md`/`RULES.md` — it builds a fresh platform skeleton and
writes its own three docs. Sections 1–4 and 6–9 are otherwise unchanged and remain Case A/B
guidance, now cross-referenced accordingly.*
