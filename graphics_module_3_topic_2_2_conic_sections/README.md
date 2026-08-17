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
(ADR-141 · RULES.md §6.30–§6.32). Nothing is named before it has been seen.

| Step | Title | The chapter | What the learner does | Controls |
|---|---|---|---|---|
| 1 | Meet the cone | §6.1 opening | Turns the cone, stretches it, notices the one angle everything depends on — and hovers the labels on the solid to find out what each part is called. | How wide · how tall · show the second half |
| 2 | Cut it | §6.1 | Aims a flat plane through the cone, ticks **“Cut the cone”**, and watches the section face change shape. The readout describes what is on screen **in plain words, with no name**. | Cut the cone · the tilt. The plane itself is placed by the step. |
| 3 | Different cuts, different curves | §6.1 | Presses each of the six names; the plane travels there and the readout names it and states the textbook rule. The turning point — the cone's own slope — is the whole lesson. | Six "show me" chips (the tilt and offset ride in beside them once the workbench split is open) |
| 4 | Why they differ | §6.2 → §6.3 (+§6.4/§6.8 on request) | Walks a **seven-stage proof, one press at a time**: the cutting plane · a ball fitted until it jams · **against the CONE, a whole ring** and why it is a ring · **against the CUT, one point** — the focus · the plane laid through that ring · the directrix drawn out of the two planes crossing · the hand-over to the paper. Nothing plays by itself, and nothing reaches the sheet before the cone has explained it. | Back · Next · the tilt of the cut · show all three · label the engineering names |
| 5 | Now draw it | §6.5, §6.6, §6.7, §6.9 · **syllabus 1003 Module II** | Watches the eccentricity construction draw itself, steps it a line at a time, hides the construction lines to read the finished figure, and tries the other nine methods. Reads off what the drawing MEASURES. Points at anything on the sheet to be told what it is. On a parabola, watches §6.6's three properties drawn one at a time. | Draw it step by step · back/next a line · show the construction lines · *e* · focus-to-directrix · the construction · its given dimensions · points · tangent at P · show its three properties (parabola only) |
| 6 | Your turn | assessment | Is dealt a cut nobody chose, names it before checking, and is marked against the same classifier the lesson taught with. | Set up a cut · six answer chips |

The **Practice problems** entry (top of the step card) deals **seven** problems, grouped by curve:
the three chapter exercises that are answered with the syllabus constructions, plus the four
practice questions for those same three (ADR-212). All fifteen chapter exercises are still in
`src/problems.js` verbatim — `ENABLED_METHODS` decides which are dealt, and widening it is a
one-line change. No measured quantity is ever auto-filled: the learner dials every dimension and
the check recognises the match. The one thing that IS set for them is the construction the
statement names in words, once, on their first arrival at Step 5 (ADR-213).

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
                    the sheet: one focal-polar conic model, eight sheet modes (locus, terms,
                    eccentricity, methods, props, circle, triangle, nothing), ten
                    constructions, one renderer. No DOM, no THREE, no imports.
  sectionCut.js     Topic-1's analytic single-plane clipper, verbatim (ADR-058). Truncates each
                    nappe and supplies both the cap and the welded section loop (ADR-165).
  cone.js           }
  iShape.js         } byte-identical to Module2/src/ — fix drift in the master, re-copy here.
  shapeData.js      }
  anim.js           }
  stepper.js        The six-step guided sequence and its copy.
  uiManager.js      The parameter dock: six control groups, one per step.
  problems.js       PURE DATA. The chapter's fifteen exercises verbatim + the four syllabus
                    practice questions, with targets + hints. ENABLED_METHODS deals seven.
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
same mesh turned 180° about X — so the two share an apex. Once the learner ticks **Cut the cone**,
`sectionCut.js` slices each nappe in mesh-local space and the nappe's geometry is REPLACED by the
result, with the clipper's cap becoming material group 1 in the section token — the reference
topic's own pattern, so the cut face is a real face of a real solid. The clipper's welded boundary
loop is drawn over it as a fat `Line2`, and the material the cut removed is kept as a faint ghost
so a steep tilt still reads as a cone and a hyperbola keeps its second branch (ADR-165).

**Where the focus and the directrix come from.** §6.2 defines both ON THE SOLID, and Step 4 shows
it: `focalSphereFor()` (pure, in `conicData.js`) inscribes a sphere in the cone until it touches
the cutting plane — the touching point is the focus — and takes the plane holding its circle of
contact with the cone, whose intersection with the cutting plane is the directrix. It is solved in
the V.P. as plane trigonometry, because the cutting plane is always perpendicular to it. Two cases
are honest returns rather than special cases: the apex cut has no inscribed sphere at all, and the
circle's tangent plane is PARALLEL to its cutting plane, which is why a circle has no directrix
(ADR-166).

**The join between them.** The sheet is not a second picture: it draws the curve of the LIVE cut.
`eccentricityForSection()` is the chapter's own identity re-expressed in the quantities this topic
dials — `e = sin θ ÷ sin g`, the plane's tilt over the cone's generator angle — so moving the plane
or reshaping the cone moves the drawn curve. Steps 1–4 hold that link; Step 5 releases it, because
from there the exercises give *e* and the focal distance as data.

**The curve (2D).** `conicEngine.js` holds one model — the focal polar r = e·FA ÷ (1 + e·cos θ) —
and derives every named quantity of all three curves from it. Each sheet mode and each
construction returns a display list of typed primitives plus the analytic bounding box that locks
the millimetre scale (the ADR-053 pattern), and one renderer paints them in drafting order:
construction linework thin, the finished curve heavy, the marked apparatus on top.

---

## Verifying

Five oracles live in `verify/`, all run with Node's built-ins only — no npm, no puppeteer
(ADR-019, RULES.md §2.17–§2.19). **`verify/` is tooling, not payload: exclude it when packaging
the ZIP.** Nothing in `index.html` or `main.js` references it.

```
node verify/conic-math.mjs       # the mathematics — pure, instant
node verify/shipped-module.mjs   # the shipped page in headless Chrome (~40 s)
node verify/annotations.mjs      # the labels, the axis and the tooltips (~30 s)
node verify/interaction.mjs      # the cut, the sync, the sheet's hover (~60 s)
node verify/proof.mjs            # Step 4's six proof stages, walked by hand (~50 s)
```

1. **The mathematics** (`verify/conic-math.mjs`). Also proves §6.2's focal sphere is the real
   thing: it measures PF ÷ PQ at the vertices of the ACTUAL section — the cutting line's
   intersections with the generators — and demands §6.3's eccentricity, for the circle, both
   ellipse limits, the parabola, the hyperbola, the rectangular hyperbola and a plane above the
   apex. Then it imports `src/conicEngine.js` and asserts that
   every plotted construction point satisfies its own conic: PF = e·PQ for the locus, x²/a² + y²/b² = 1 for the
   ellipse constructions, a zero discriminant for the tangent method's envelope, a constant sum /
   difference / product for the arc, foci and asymptote methods. All twelve constructions and all
   four sheet modes are covered.
2. **The shipped module** (`verify/shipped-module.mjs`). Serves this folder and drives Chrome
   headlessly over the DevTools Protocol to assert a clean boot (no console errors, watchdog cleared), the platform contract
   (`simAPI`, `<title>` = `meta.json.title`), six rail steps with one panel visible at a time, the
   sheet painting for each of the eleven constructions, the six section classifications through
   the real sliders, the reset path, the seven dealt problems — and a flat WebGL buffer count across
   50 rapid rebuilds (the disposal contract, ADR-004/ADR-042). Anything that waits on a tween
   POLLS for the result; a fixed sleep against the 700 ms plane travel failed about one run in two
   under SwiftShader while the product was correct.
3. **The annotations** (`verify/annotations.mjs`, ADR-164). Asserts that Step 1 names exactly
   §6.1's vocabulary and nothing else, that every label carries a plain-English sentence, that no
   two pills overlap and none leaves the pane across five orbit poses, that the tooltip waits for
   a deliberate hover, and that both nappe labels leave with the second half. It also writes
   screenshots to the OS temp directory for the linework an assertion cannot judge.

4. **The interactions** (`verify/interaction.mjs`, ADR-165). Asserts the things a learner DOES:
   that Step 2 offers the cut as a choice and ticking it changes what the readout describes, that
   tilting the cut changes what the sheet is drawing (and quotes it against the cone the learner
   shaped), that Step 4 opens on the curve alone and holds its vocabulary back until the reveal
   reaches the ratio, and that the sheet explains itself under the cursor — it sweeps the whole
   canvas and counts the distinct explanations it can reach.

All four were green at the time of writing; re-run them after touching `conicEngine.js`,
`main.js`, or any control wiring.

---

## The teaching contract (read before changing a control)

The topic is sequenced, not exposed (ADR-141). Three rules hold it together:

1. **A control lives in the one step whose question it answers.** If a new control does not help
   with the step's own objective, it does not belong on that panel — and probably not at all.
2. **Plain words before the name.** Every entry in `ConicSection` carries `seen` (what is on
   screen, in everyday language), `name`, and `rule` (the textbook statement). Step 2 may use only
   `seen`; Step 3 introduces `name` and `rule`; Step 6 withholds all three until the learner has
   committed to an answer.
3. **The sim may move the model to teach, never to answer.** Step 3's chips travel the plane and
   Step 5 plays the construction — but the Problem Library's checked targets stay hand-dialled
   (ADR-063 still holds for those).
4. **A label is an annotation, not a word** (ADR-164). Add one only through `annotate()`, which
   demands a leader target and a plain-English sentence; it leaves with the geometry it names, and
   it belongs to the one step that teaches it.

## Things not to "fix"

- **No "parallel to a generator" preset in the Problem Library.** Step 3's chips demonstrate the six cuts; the library's checked answers are still dialled by hand (ADR-063, scoped by ADR-141).
- **The plane has no on/off toggle.** Step 2 switching it on IS the step.
- **Step 4 does not draw the tangent and normal.** They belong to Step 5, where their toggle lives.
- **The cone IS cut away, and the removed material is kept as a faint ghost.** The ghost is not decoration: without it a steep tilt leaves a stump no learner would call a cone, and a hyperbola's second branch leaves with the nappe that carried it (ADR-165, superseding ADR-140 · RULES.md §3.41).
- **`sectionState.enabled` and `sectionState.cut` are different things.** `enabled` means the plane is present and the guided step decides it; `cut` means the plane bites and the learner decides it. Do not collapse them.
- **The sheet draws what the cut IS, and three of the six sections are not plane conics.** The circle gets a true circle at the cone's own radius there, the apex cut gets §6.1's isosceles triangle (or the single point, where the plane through the apex is flatter than the generators), and a plane clear of the cone gets a sheet that says so. `cutKind` is derived in `rebuild()`'s tail — after the clipper has reported — and the dock and the reveal branch on the same value, so the panes cannot disagree (ADR-167 · RULES.md §3.45).
- **The three constructions the SYLLABUS names are staged; the other ten are not** (ADR-175 · RULES.md §3.54). Course 1003 scopes this topic to *"Ellipse – Rectangular Method & Concentric Circle Method only, Parabola- Tangent method only"*. Those three play stage by stage; the rest draw whole and carry a "Beyond the Diploma syllabus" badge. Do not stage the others without writing their teaching copy — stages are prose, not geometry.
- **The Engineering Terms panel highlights by CAPTION, never by item reference** — `drawCompare()` rebuilds the display list every paint (RULES.md §3.55).
- **The circle method (§6.5 item 7) is deliberately absent.** The chapter names it and gives no procedure; supplying one would be inventing syllabus rather than covering it (ADR-171). The four-centre approximation next to it IS implemented, because that one is a fixed classical construction.
- **The sheet reports what it measures, and the numbers are the DRAWING's.** Every layout carries `results`, rendered as "What the drawing gives you" at the foot of Step 5 — the quantities six of the chapter's exercises ask the learner to determine, each with the lettering that says where to read it. Do not report a given back as though it were an answer: the parallelogram method's axes are not its conjugate diameters (ADR-168 · RULES.md §3.46).
- **Step 4 never plays by itself** (ADR-172 · RULES.md §3.49). It is a proof the learner walks with Back and Next; Next is refused while a stage is animating, Back restores the previous stage without replaying it.
- **The two tangencies get two stages, and must stay separate** (ADR-174 · RULES.md §3.52). Sphere-to-CONE is a circle; sphere-to-CUT is a point. Shown together the ring reads as the plane's own contact, which is exactly what the name "tangent plane" already invites. The ring is instrument teal, the focus is conic-mark plum — do not unify those colours.
- **Never hard-code a stage index.** The bridge is `stages.length − 1` and the circle's shorter proof ends at the stage carrying `sayFlat`, found by search. A literal index has silently pointed at the wrong stage twice (RULES.md §3.53).
- **The tangent plane genuinely passes through the focal sphere, and that IS §6.2's definition** — it is the plane containing the circle in which the sphere touches the CONE, so it meets the sphere in that same circle. Do not "fix" it to touch at a point: the centre-to-plane distance is t·sin²α against a radius of t·sinα, equal only on a degenerate cone, and a sphere-tangent plane would move the directrix and break PF ÷ PQ = e (ADR-172/096 · RULES.md §3.50).
- **That is why it is drawn as an ANNULUS starting at the contact circle** (`tangentPatchFor()`): none of the drawn plane is inside the ball, so it cannot read as a slice. Do not replace it with a quad and reach for depthWrite/renderOrder/polygonOffset — the intersection is real and no render state hides it (RULES.md §3.51). The ONE point of contact in this topic is the ball against the CUTTING plane — the focus — and that is where the finite patch, the pulsing marker and the caption live.
- **The sheet's eccentricity is derived, not dialled, in Steps 1–4.** `e = sin θ ÷ sin g` from the live cut (ADR-165). The dials return in Step 5, where the chapter gives *e* and the focal distance as data — the Problem Library needs them, and two exercises are unsolvable without the focal distance.
- **The axis is drawn in every step, and shows through the solid.** It is a centre line, not a Step-1 annotation: chain-line stub outside the outline, short-dash hidden linework inside, at the platform's own constants. Do not "clean it up" out of Steps 2–6 (ADR-164, RULES.md §3.38).
- **The sheet's caption pass may DROP a caption on a crowded figure.** By design — a name that cannot be placed clear of another name or of the finished curve is worse than absent. Never let a construction depend on a caption to be legible (§3.39).
- **The sheet stores millimetres, the scene stores world units.** Deliberate (ADR-138); the dock converts, the engine never does.
- **The Problem Library stamps nothing on load.** Every checked quantity is dial-able here, so injecting one would hand over part of the answer.
- **Only the cone generator is present.** The other four Module-2 generators, `genericSolid.js` and `meshAnalyzer.js` were deliberately not copied in.
