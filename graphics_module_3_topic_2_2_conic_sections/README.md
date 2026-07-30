# Conic Sections — Module 3, Topic 2.2

A Simatrix Engineering Graphics simulation payload. It teaches Chapter 6 of the prescribed
textbook end to end: the curves a plane cuts from a right circular double cone, and how to draw
each of them with instruments.

Run it by serving this folder over HTTP — locally XAMPP Apache on **port 8080**
(`http://localhost:8080/Simatrix/graphics_module_3_topic_2_2_conic_sections/`). `file://` will
not work: the sim is ES modules, which need an origin. Hard-reload after an edit; Apache sends no
`Cache-Control`, so Chrome serves stale modules.

---

## What the learner does

The six steps are a story, and each one shows only the controls its own question needs
(ADR-086 · RULES.md §6.26–§6.28). Nothing is named before it has been seen.

| Step | Title | The chapter | What the learner does | Controls |
|---|---|---|---|---|
| 1 | Meet the cone | §6.1 opening | Turns the cone, stretches it, and notices the one angle everything depends on: the slope of its side. | How wide · how tall · show the second half |
| 2 | Cut it | §6.1 | Tilts a flat sheet through the cone and watches the cut change shape. The readout describes what is on screen **in plain words, with no name**. | The tilt — and nothing else. The plane is switched on by the step itself. |
| 3 | Different cuts, different curves | §6.1 | Presses each of the six names; the plane travels there and the readout states the textbook rule. The turning point — the cone's own slope — is the whole lesson. | Six "show me" chips · the tilt · slide it past the tip |
| 4 | Why they differ | §6.3 (+§6.2/§6.4/§6.8 on request) | The camera swings round to face the cut, the drawing sheet opens with the same curve, and one slider — the ratio PF ÷ PQ — turns it from ellipse to parabola to hyperbola. | The ratio · show all three · label the engineering names |
| 5 | Drawing it on paper | §6.5, §6.7, §6.9 | Watches the eccentricity construction draw itself one stage at a time, then tries the other eleven standard methods. | Draw it step by step · the construction · its given dimensions · points · tangent at P |
| 6 | Your turn | assessment | Is dealt a cut nobody chose, names it before checking, and is marked against the same classifier the lesson taught with. | Set up a cut · six answer chips |

The **Practice problems** entry (top of the step card) carries all fifteen exercises from the end
of the chapter, verbatim, grouped by curve. Nothing is ever auto-filled: the learner dials the
construction and the check recognises the match.

---

## File map

```
index.html          The single page: import map (three@0.160.0), design tokens + all CSS
                    inline, the wizard/viewport markup, the six step panels, the problem
                    library dialog, and the boot watchdog.
main.js             Orchestrator. Scene, camera, the single rebuild() pipeline, the double
                    cone, the section stage, the drawing-sheet Compare card, window.simAPI,
                    and the simController every leaf is injected with.
meta.json           Platform catalogue record (title / description / difficulty / tags).

src/
  conicData.js      PURE DATA. The six section planes and their rules, classifySection(),
                    generatorAngleDeg(), the eleven construction methods with the dimensions
                    each is given, and the two topic-local state shapes.
  conicEngine.js    PURE 2D ENGINE. All plane-curve mathematics and the Canvas2D drawing for
                    the sheet: one focal-polar conic model, four sheet modes, twelve
                    constructions, one renderer. No DOM, no THREE, no imports.
  sectionCut.js     Topic-1's analytic single-plane clipper, verbatim (ADR-058). Used here to
                    EXTRACT the section loop, not to truncate the solid.
  cone.js           }
  iShape.js         } byte-identical to Module2/src/ — fix drift in the master, re-copy here.
  shapeData.js      }
  anim.js           }
  stepper.js        The six-step guided sequence and its copy.
  uiManager.js      The parameter dock: six control groups, one per step.
  problems.js       PURE DATA. The chapter's fifteen exercises, verbatim, with targets + hints.
  problemLibrary.js The library overlay, the scaffolded hints, and the self-check.
  terms.js          The inline term-definition popovers (markup-driven).
  onboarding.js     The orbit hint and the two first-seen spotlight chips.

verify/             Node oracles — TOOLING, NOT PAYLOAD (see "Verifying"; exclude from the ZIP).
```

Leaf modules never import each other; the one exception is the pure-data catalogue
`conicData.js` (RULES.md §3.6a). Everything else hangs off `main.js`.

---

## The two halves, and why they are shaped this way

**The cone (3D).** `buildDoubleCone()` runs the restored `cone.js` twice — the upper nappe is the
same mesh turned 180° about X — so the two share an apex. `sectionCut.js` slices each nappe in
mesh-local space and returns an ordered, welded boundary loop; the topic draws that loop as a fat
`Line2` and lifts the clipper's cap triangles out as the section face, then throws the sliced
solid away. The cone itself is never cut down, because a hyperbola needs both nappes on screen and
the chapter's own pictorials (Fig. 6.2) show the section on an intact cone.

**The curve (2D).** `conicEngine.js` holds one model — the focal polar r = e·FA ÷ (1 + e·cos θ) —
and derives every named quantity of all three curves from it. Each sheet mode and each
construction returns a display list of typed primitives plus the analytic bounding box that locks
the millimetre scale (the ADR-053 pattern), and one renderer paints them in drafting order:
construction linework thin, the finished curve heavy, the marked apparatus on top.

---

## Verifying

Two oracles live in `verify/`, both run with Node's built-ins only — no npm, no puppeteer
(ADR-019, RULES.md §2.17–§2.19). **`verify/` is tooling, not payload: exclude it when packaging
the ZIP.** Nothing in `index.html` or `main.js` references it.

```
node verify/conic-math.mjs       # the mathematics — pure, instant
node verify/shipped-module.mjs   # the shipped page in headless Chrome (~40 s)
```

1. **The mathematics** (`verify/conic-math.mjs`). Imports `src/conicEngine.js` and asserts that
   every plotted construction point satisfies its own conic: PF = e·PQ for the locus, x²/a² + y²/b² = 1 for the
   ellipse constructions, a zero discriminant for the tangent method's envelope, a constant sum /
   difference / product for the arc, foci and asymptote methods. All twelve constructions and all
   four sheet modes are covered.
2. **The shipped module** (`verify/shipped-module.mjs`). Serves this folder and drives Chrome
   headlessly over the DevTools Protocol to assert a clean boot (no console errors, watchdog cleared), the platform contract
   (`simAPI`, `<title>` = `meta.json.title`), six rail steps with one panel visible at a time, the
   sheet painting for each of the eleven constructions, the six section classifications through
   the real sliders, the reset path, the fifteen problems — and a flat WebGL buffer count across
   50 rapid rebuilds (the disposal contract, ADR-004/ADR-042).

Both were green at the time of writing; re-run them after touching `conicEngine.js`, `main.js`, or
any control wiring.

---

## The teaching contract (read before changing a control)

The topic is sequenced, not exposed (ADR-086). Three rules hold it together:

1. **A control lives in the one step whose question it answers.** If a new control does not help
   with the step's own objective, it does not belong on that panel — and probably not at all.
2. **Plain words before the name.** Every entry in `ConicSection` carries `seen` (what is on
   screen, in everyday language), `name`, and `rule` (the textbook statement). Step 2 may use only
   `seen`; Step 3 introduces `name` and `rule`; Step 6 withholds all three until the learner has
   committed to an answer.
3. **The sim may move the model to teach, never to answer.** Step 3's chips travel the plane and
   Step 5 plays the construction — but the Problem Library's checked targets stay hand-dialled
   (ADR-063 still holds for those).

## Things not to "fix"

- **No "parallel to a generator" preset in the Problem Library.** Step 3's chips demonstrate the six cuts; the library's checked answers are still dialled by hand (ADR-063, scoped by ADR-086).
- **The plane has no on/off toggle.** Step 2 switching it on IS the step.
- **Step 4 does not draw the tangent and normal.** They belong to Step 5, where their toggle lives.
- **The cone is not cut away when it is sectioned.** That is topic 1's lesson; here the curve is the subject (ADR-085).
- **The sheet stores millimetres, the scene stores world units.** Deliberate (ADR-083); the dock converts, the engine never does.
- **The Problem Library stamps nothing on load.** Every checked quantity is dial-able here, so injecting one would hand over part of the answer.
- **Only the cone generator is present.** The other four Module-2 generators, `genericSolid.js` and `meshAnalyzer.js` were deliberately not copied in.
