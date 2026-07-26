# CLAUDE.md — Simatrix · Module 1 Topic 2: Spatial Framework (BUILT)

> **STATUS: BUILT + POLISHED + FINAL REFINEMENTS (2026-07-04) — data, wizard, 3D
> geometry, label layer, term popovers, parameter dock, the polish pass (step-5 frustum
> illustration, camera flights, solid VP border, X/Y end marks, mm units, success toast),
> AND the final refinements (dual-camera flatten-to-2D fold, orbital slerp camera flights,
> negative-x X-end vantage, denser grid cage, off-P dashed projectors, rabattement
> terminology) done.**
>
> **Final refinements (2026-07-04, second pass):** the step-4 fold is now a DUAL-CAMERA
> event — `main.js` carries an `OrthographicCamera` + locked-rotate `controlsOrtho`
> alongside the perspective pair (ported from `Module2/src/main.js`), and `fold()` fires
> `swoopToAnswerSheet()` (fly square-on, look along −Z at the VP sheet) while
> `projectionMorphK` blends the projection perspective→orthographic each frame
> (`applyProjectionMorph` in the render loop), so the folded corner reads as a true flat
> 2D drawing; `unfold()` / any step navigating back to 3D calls `restorePerspective(true)`
> to glide back to the perspective orbit. `flyCamera()` sweeps on a TRUE spherical orbit
> (quaternion slerp of the camera's offset-from-`controls.target` direction + radius and
> pivot lerp — restored 2026-07-04 third pass after an interim Bezier "hop" broke the VP
> crossings) so quadrant walks circle *around* the point, crossing the VP for ±Z walks,
> the HP for ±Y walks, both for diagonals, always around the fold line's X end. The
> `CAMERA_POSE` vantage keeps every pose at x < 0 near the 'X' end mark, and the Q1–Q4
> poses sit PHYSICALLY INSIDE their own room (position y/z signs = the quadrant's sign
> pair — Q2/Q3 behind the VP at z < 0), so a room walk genuinely crosses the dividing
> sheet(s). `point.js` starts both dashed projectors
> `SPHERE_GAP` (0.20) off P so the dash begins at the sphere surface (Linux GL dash-shader
> fix). `hvPlanes.js` grid went 9→48 divisions. Terminology: rabatment→rabattement (label
> + copy; `data-t` key unchanged), and the Step-2 panel title is now "Move point P amongst
> Quadrants". Headless CDP re-verified: GL + label DOM exactly flat across 50 resets and 12
> fold cycles, full swoop→ortho→restore + 4→5→4 round trip with 0 console errors.
> The data layer (`spatialData.js`), the 5-step guided sequence
> (`spatialSteps.js` + `stepper.js`), and the 3D lesson content are wired through
> `main.js` and headless-verified (ADR-019; live GL resources exactly flat across 50
> rebuilds): `hvPlanes.js` draws the HP/VP pair — half sheets for the step-1 room corner,
> extended past the fold line when `showQuad` — with the HP inside a pivot hinged on the
> X fold line; `point.js` draws P plus the p/p′ thick-dot views and dashed fat-line
> projectors (ADR-016); `anim.js` (byte-identical platform copy) drives the 1600 ms
> `easeFold` rabatment through `simController.fold()/unfold()` with no rebuild mid-swing
> (snaps under reduced motion). `labelLayer.js` (2026-07-03) completes the topic: the
> CSS2D HP/VP/XY + P/p/p′ callouts (`.lbl`/`.lbl--chip`, legacy `quadrants.js` anchors),
> the I–IV quadrant numerals under `showQuad` (P's room ink+700, others receding —
> Two-Cue), and the BIS first-angle badge (`#fa-symbol`) under `showSymbol` — with the
> HP-riding labels (HP, p) in an internal hinge the fold tween drives alongside the two
> geometry leaves, and a `clear()`/`dispose()` that physically removes every CSS2D DOM
> node (RULES.md §3.5; headless-verified exactly flat across 50 resets). `terms.js` +
> `uiManager.js` (2026-07-03) complete the interactive chrome: the singleton `#term-pop`
> glossary popover (DESIGN.md §5.7 — delegated from `#wizard`, so the stepper's
> re-rendered step bodies need no re-wiring) and the Point P parameter dock (HP/VP
> distance slider ↔ field pairs + quadrant select, everything routed through
> `simController.commit()`, cross-synced with the wizard after every commit; 21/21
> headless checks green, GL/DOM flat across 50 slider-driven rebuilds). The polish pass
> (2026-07-04) finished the topic: `frustums.js` draws step 5's classic textbook figure —
> cone frustums in Quadrants I and III (Q3 the point-reflection) with concentric-circle
> top views on HP, trapezoid front views on VP, dashed projectors — while P and its
> chips stand down (view flags only) and the hinge re-opens without un-doing step 4's ✓
> (`foldPose: 'open'`); `main.js` gained a camera pose table (default / Q1–Q4 / showcase)
> flown on 900 ms `easeCamera` tweens (drag cancels, pose-equality guard, reduced motion
> snaps) plus the `#sim-toast` win on first reaching step 5; the VP sheet border went
> SOLID amber (explicit user override of the Two-Cue dash pairing, sheet border only —
> see `hvPlanes.js`), the grids densified into a "cage", the `XY` chip became `X`/`Y`
> fold-line end marks, the dock lost its quadrant select (room buttons are the one
> quadrant control), and every unit relabelled cm → mm (pure relabel, ADR-018). 29/29
> headless checks green (ADR-019): GL + label DOM exactly flat across 50 step-5-resident
> rebuilds, 50 step-4↔5 round trips, and 50 slider rebuilds.

This topic combines Module 1's two remaining flat lessons — **Quadrants** and
**First-angle** — into a single topic that teaches the projection framework itself: a point
oriented in 3D space relative to the Horizontal Plane (HP) and Vertical Plane (VP), the four
quadrants their intersection creates, and the first-angle fold that turns that 3D picture
into the flat orthographic layout every later Module 1 lesson (Points, Lines) assumes the
learner already understands.

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

**Design system rules:** Always read and strictly follow the consolidated platform design
system at `../DESIGN.md` (Simatrix root) for all colour, typography, spacing, component
styling, and UI/UX decisions — Module 2 is its master/reference implementation. Strategic
context — users, brand personality, anti-references, design principles, accessibility
commitments — lives in the consolidated root `../PRODUCT.md` (the single platform-wide
product contract; ADR-023). Never hard-code design values in CSS or JS — consume tokens
defined in `../DESIGN.md`. This topic does **not** and must **not** carry a local
`DESIGN.md`/`PRODUCT.md` copy (ADR-028) — if a genuine module-local *appendix* is needed
later (e.g. documenting this topic's specific HP/VP viewport encoding once it's designed),
add it as a small `DESIGN.md` that itself points back to the root file, the way
`graphics_module_1_topic_1_foundations/DESIGN.md` does — never a duplicate of the root
content.

**Scope boundary:** This module produces a self-contained Three.js *simulation payload* —
the 3D viewport plus its parameter dock, sliders, toggles, inline hints, and sim-internal
animations. The host Simatrix website (top-level navbar, module browser, account UI,
marketing chrome, login, dashboard) is built by other web developers and is **out of scope**
here. Treat the sim like a teaching aid embedded in someone else's page: do not render
navigation, branding, footer, or any platform-level UI inside the sim's iframe.

---

## Architecture — Module 2 orchestrator pattern (ADR-033, overturns ADR-011 for this topic)

Per **ADR-033**, Module 1's remaining topics adopt **Module 2's orchestrator + leaf-module
pattern** (ADR-007) instead of the shared-`engine.js` + thin-page structure (ADR-011).
Concretely for this topic:

- `src/main.js` is the **orchestrator**: it owns the scene, the camera/`OrbitControls`, the
  single `rebuild()` pipeline (with the full WebGL disposal contract, ADR-004), the render
  loop, and `window.simAPI`. This already exists and boots an empty scene.
- Leaf modules hang off `main.js` as single-purpose files and **do not import one another**
  (ADR-007's star topology). Built: `stepper.js` (the guided sequence controller — it may
  import the pure-data `spatialSteps.js`, the same data-not-leaf relationship as Module 2's
  `problemLibrary.js` ← `problems.js`), `hvPlanes.js` (the HP/VP plane pair + fold hinge),
  `point.js` (P + the p/p′ views + projectors). The two geometry leaves expose the same
  controller shape — `{ group, setFoldAngle, setOpacity, setResolution, dispose }`
  (`setOpacity(k)` scales the leaf's own material opacities 0→target for the
  orchestrator's transition fades) — and `main.js`
  drives all the hinges from one `easeFold` tween, so no leaf ever references a sibling.
  `frustums.js` (2026-07-04) is a fourth geometry-shaped leaf with the same controller
  contract — step 5's two-frustum illustration, its riding top views in the same kind of
  internal hinge. `labelLayer.js` (built 2026-07-03) follows the same shape plus
  `generate`/`clear` for the CSS2D callouts, I–IV numerals, and the BIS symbol; its
  HP-riding labels sit in the same kind of internal hinge, driven by the same tween.
  `terms.js` (glossary popovers — imports the pure-data `spatialSteps.js` for TERMS,
  delegates from `#wizard`) and `uiManager.js` (the parameter dock — pure DOM against
  the injected `simController`, like Module 2's) complete the leaf set (both
  2026-07-03); `main.js` re-syncs the dock and the wizard chrome after every
  `commit()`/`applyView()` so the two control surfaces never disagree.
- **World axes** (engineering-correct, the Module-1 family convention — see
  `Module1/CLAUDE.md` §"3D scene conventions"): HP = XZ plane (y = 0), VP = XY plane
  (z = 0), fold line = X axis. `spatialData.resolvePosition()` returns DATA-SPACE signed
  mm (x = ±distVP, y = ±distHP; the lessons label the stored magnitudes mm since
  2026-07-04 — a pure relabel, ADR-018); `main.js`'s `worldPosition()` remaps them onto
  world axes (height → Y, depth in front of VP → Z, lateral → X ≡ 0) and scales ÷ 10
  (1 world unit = 10 mm) — the identical data-space → draw-space split the legacy
  quadrants/firstangle `draw3D` used. Do not "fix" `spatialData.js` to emit world axes.
- No shared `Module1/src/engine.js` frame is used here — this topic does not call
  `initSim()` and never will.
- **Sibling for cross-reference:** `../graphics_module_1_topic_1_foundations` is the closest
  working example of this pattern applied inside the Module 1 family (camera-orbitable
  scene, `window.simAPI`, disposal contract, guided stepper). Its `meshAnalyzer.js`/solid
  machinery is **not** relevant here — this topic has no solid to analyse, just a point and
  two planes.

## Platform contract (already wired — do not add a second path)

- **`meta.json`** at the folder root carries all four required fields (`title`,
  `description`, `difficulty`, `tags` — RULES.md §2.11).
- **`window.simAPI`** (`src/main.js`) exposes `pause()` / `resume()` / `reset()`. `reset()`
  routes through the single `rebuild()` pipeline — when an in-sim Reset control is added, it
  **must** call `simAPI.reset()`, never a second reset path (RULES.md §2.9).
- **`sim:ready` boot signal** (ADR-078, narrows ADR-002): `markBooted()` posts
  `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` — the one
  sanctioned outbound `postMessage`. Do not add any other `postMessage`/inbound listener.
- **Mobile notice**, boot watchdog + WebGL fallback, and the reduced-motion collapse are
  already present in `index.html`/`main.js` — reuse them, don't re-implement.
- **Self-starting**: `src/main.js` calls `init()` itself at module load; no external caller.

## What's built vs. what's still open

| Area | State |
|---|---|
| Import map, fonts, design tokens, boot watchdog, WebGL fallback | **Done** |
| `meta.json` (title/description/difficulty/tags) | **Done** |
| `window.simAPI` (`pause`/`resume`/`reset`) + empty `rebuild()` seam | **Done** |
| Empty orbitable scene (camera, lights, `OrbitControls`, resize) | **Done** |
| Data layer (`src/spatialData.js` — point distances, quadrant signs, position/quadrant resolvers) | **Done** (2026-07-02) — pure data, adapted from `Module1/src/pointData.js`, zero `engine.js` dependency; consumed by `rebuild()` via `worldPosition()` |
| HP/VP plane geometry + fold | **Done** (2026-07-02, polished 2026-07-04) — `src/hvPlanes.js` (half/extended sheets, "cage" grids, fat-line borders — **VP border SOLID amber by explicit user override** of the Two-Cue dash pairing, sheet border only, see the file header — HP fold pivot) + `src/anim.js` wired: `fold()/unfold()` tween the hinge 1600 ms on `easeFold`, snap under reduced motion |
| The point + its projections | **Done** (2026-07-02) — `src/point.js`: P (ink sphere + paper halo), thick-dot p/p′ (ADR-016), dashed `LineSegments2` projectors; the quadrant walk re-homes P via `commit()`/`applyView()` |
| CSS2D label layer (callouts, numerals, BIS badge) | **Done** (2026-07-03, polished 2026-07-04) — `src/labelLayer.js`: HP/VP callouts + **X/Y fold-line end marks** (textbook convention; replaced the mid-line XY chip) + boxed P/p/p′ chips (legacy `quadrants.js` anchors, `.lbl`/`.lbl--chip` token CSS), I–IV numerals with P's room highlighted **only while P is on stage** (Two-Cue: ink+700 vs bench-grey+400), `#fa-symbol` BIS badge behind `showSymbol`; HP-riding labels hinged for the fold; `clear()`/`dispose()` physically remove every CSS2D DOM node (RULES.md §3.5) — headless-verified flat across 50 resets |
| Guided-step wizard (rail + card content) | **Done** (2026-07-02) — 5-step "Room & Shadow" sequence (`src/spatialSteps.js`, TERMS merged verbatim from the legacy quadrant/first-angle lessons), Module-2-pattern controller (`src/stepper.js`), wizard rail/card markup in `index.html`, wired via `main.js`'s injected `simController`; headless-verified per ADR-019 |
| Term popovers (DESIGN.md §5.7) | **Done** (2026-07-03) — `src/terms.js`: the Module-1 family singleton `#term-pop` (accent-wash, fixed, flip-above, Escape, `aria-describedby`), filled from TERMS, listeners delegated from `#wizard` so re-rendered step bodies need no re-wiring; placement behaviour from the master `Module2/src/terms.js`; stepper's interim native `title`/`aria-label` wiring removed |
| Point P controls (native, no separate dock) | **Done** (2026-07-03, trimmed 2026-07-04) — `src/uiManager.js` (`initUIManager(simController)` → `{ sync, dispose }`): HP/VP distance slider ↔ numeric-field two-way sync (clamp on commit, invalid entry reverts + narrates), all through `commit()` in mm; **the quadrant select was removed** (step 2's room buttons are the one quadrant control; the `lockQuadrant` flag died with it); lives in a native Module-2 `.dock__group` inside `#step-card` (`#controls`), revealed by progressive disclosure — hidden on steps 1 and 5 (no P on stage), shown steps 2–4; Module 2's token-only `.field`/`.dock__group` CSS in `index.html`; GL/DOM exactly flat across 50 slider-driven rebuilds |
| Step-5 frustum illustration | **Done** (2026-07-04) — `src/frustums.js`: cone frustums in Q1 + Q3 (Q3 point-reflected) with concentric-circle top views on HP (riding the fold hinge), trapezoid front views on VP, dashed body→view projectors (body→HP re-stretched in place through the fold); opaque token-blend body so the translucent sheet grids overlay the Q3 frustum (the "cage" read); same `{ group, setFoldAngle, setResolution, dispose }` contract |
| Camera pose flights + success toast | **Done** (2026-07-04) — `main.js`: `CAMERA_POSE` table (default / Q1–Q4 / showcase, `default` IS the reset pose) flown by `flyCamera()` on 900 ms `easeCamera` tweens from `setQuadrant()` and `applyView()` (never `commit()` — sliders must not fly the camera); drag cancels the flight, pose-equality guard stops self-tweens, reduced motion snaps; `showToast()` (`#sim-toast`, Topic-1 port) fired once by the stepper on first reaching step 5, merged into the one announcement, re-armed by reset |
| `ARCHITECTURE.md` §2 registration of this folder | **Done** (2026-07-03) — §2 codebase map reflects the full build: data + wizard + 3D geometry + labels + popovers + dock, all headless-verified |

*(A `../DESIGN.md` topic appendix was considered and dropped (2026-07-03): the viewport
encoding strictly reuses the root token table's HP/VP hues with their standard second cues,
so there is nothing module-local to document — a local file would only violate ADR-028.)*

## File structure

```
graphics_module_1_topic_2_spatial_framework/
├── index.html            ← thin shell (importmap + canvas + wizard chrome with the
│                            native Point P #controls group — .dock__group inside
│                            #step-card, revealed by progressive disclosure, NOT a
│                            separate dock — + the #term-pop singleton); self-starting
├── meta.json              ← platform metadata (done)
├── CLAUDE.md              ← THIS file
├── assets/fonts/          ← bundled woff2 (done, byte-identical to the platform set)
└── src/
    ├── main.js            ← orchestrator: scene, OrbitControls, single rebuild() (leaf-owned
    │                         disposal contract), rAF loop (ticks anim.js), window.simAPI,
    │                         worldPosition() data→world remap (mm ÷ 10), the easeFold fold
    │                         driver + foldPose targeting, the CAMERA_POSE table (negative-x
    │                         X-end vantage) + flyCamera() SPHERICAL-ARC flights (slerp,
    │                         drag-cancel, pose guard), showToast(); AND the dual-camera
    │                         flatten-to-2D (OrthographicCamera + controlsOrtho,
    │                         swoopToAnswerSheet/restorePerspective/engageOrtho,
    │                         projectionMorphK + applyProjectionMorph — Module2 port);
    │                         AND the transition fades — a per-leaf `fadeState` opacity
    │                         multiplier (re-stamped by applyFadeLevels() after every
    │                         rebuild) + an always-disposed fade-out graveyard, so
    │                         applyView() fades planes in on grow (Step 1→2) and
    │                         cross-fades point↔frustums across 4↔5, and steps 1–3's
    │                         foldPose:'unfolded' auto-reverses the fold on back-nav
    ├── anim.js            ← (done) tween/easing engine, byte-identical to Module2/src/anim.js
    │                         (RULES.md §7.1) — drives the fold; ticked from main.js's loop so
    │                         simAPI.pause() freezes a mid-swing fold
    ├── spatialData.js     ← (done) pure data layer: point distances from HP/VP, quadrant
    │                         enum + sign table, resolvePosition()/quadrantAt() — adapted
    │                         from Module1/src/pointData.js, no engine.js dependency
    ├── spatialSteps.js    ← (done) pure data: the 5-step "Room & Shadow" sequence + the
    │                         TERMS glossary (merged verbatim from the legacy
    │                         quadrantSteps.js + firstangleSteps.js) + DEFAULT_VIEW flags
    ├── hvPlanes.js        ← (done) HP/VP plane pair: faint fills, "cage" plane-hued grids,
    │                         fat-line borders — VP border SOLID amber (explicit user
    │                         override of the Two-Cue dash pairing, sheet border only;
    │                         see the file header — do NOT re-dash), HP fold pivot hinged
    │                         on the X fold line; { group, setFoldAngle, setResolution,
    │                         dispose }
    ├── point.js           ← (done) P + paper halo, thick-dot p/p′ views (ADR-016), dashed
    │                         LineSegments2 projectors; HP-riding pieces in an internal
    │                         hinge, P→p projector re-stretched in place during the fold
    ├── frustums.js        ← (done) step 5's textbook illustration: cone frustums in Q1 +
    │                         Q3 (Q3 point-reflected) with concentric-circle top views on
    │                         HP (in an internal fold hinge), trapezoid front views on VP,
    │                         dashed projectors (body→HP re-stretched in place); same
    │                         controller contract as the other geometry leaves
    ├── labelLayer.js      ← (done) CSS2D plane/point callouts (HP/VP + X/Y fold-line end
    │                         marks + boxed P/p/p′ chips), I–IV quadrant numerals
    │                         (showQuad; highlight only while showPoint), the BIS
    │                         first-angle badge #fa-symbol (showSymbol); HP-riding labels
    │                         in an internal fold hinge; clear()/dispose() physically
    │                         remove every CSS2D DOM node (RULES.md §3.5)
    ├── stepper.js         ← (done) guided-step controller: initStepper(simController),
    │                         Module-2 pattern — rail/card render, progressive disclosure,
    │                         fold gate, pushes each step's view flags via applyView();
    │                         fires the one-shot win toast on first reaching step 5
    ├── terms.js           ← (done) glossary popovers (DESIGN.md §5.7): fills the ONE
    │                         #term-pop from TERMS on hover/focus/tap of any `.term`
    │                         button — delegated from #wizard, so the re-rendered step
    │                         bodies need no re-wiring; placement from Module2/src/terms.js
    └── uiManager.js       ← (done) Point P controls: initUIManager(simController) →
                              { sync, dispose } — HP/VP distance slider ↔ field two-way
                              sync (mm), all through commit(); reveals the #controls
                              group by progressive disclosure (hidden when the step hides
                              the point — steps 1 and 5); the quadrant select was removed
                              2026-07-04 (step 2's room buttons are the one quadrant
                              control)
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; CDN ES modules pinned to **three@0.160.0** via the exact import map; `.js`
  extensions on every import; all paths relative (ADR-001).
- Single `rebuild()` is the only path for geometry change; full disposal contract every
  rebuild once content exists (verify `renderer.info.memory` stays flat across 50 rebuilds —
  ADR-004).
- Read all colours from CSS tokens — never hard-code hex (ADR-003). This topic's subject is
  literally the HP/VP planes, so `--color-hp-line` (teal, solid) / `--color-vp-line` (amber,
  dashed *linework*) are load-bearing — pair each with a second cue per the Two-Cue Rule
  (DESIGN.md §2.3), never colour alone. ONE standing exception: the VP **sheet border** is
  drawn SOLID amber by explicit user override (2026-07-04, documented in `hvPlanes.js`);
  VP point/projector linework keeps its dashes.
- `LineMaterial` + `LineSegments2` for any fat linework (plane edges, projectors); keep
  `resolution` in sync on resize (ADR-006).
- A new leaf module must not import a sibling leaf — only hang off `main.js` (ADR-007,
  RULES.md §3.6).

---

*Module 1 Topic 2 — Spatial Framework (Quadrants + First-angle, combined) · Module-2
orchestrator pattern (ADR-033, overturns ADR-011 for this topic) · data + wizard + 3D
geometry + step-5 frustum illustration + CSS2D label layer + term popovers + parameter
dock + camera flights + win toast all built and headless-verified · Three.js 0.160.0 ·
no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
