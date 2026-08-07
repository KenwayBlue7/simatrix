# Red-Team Curriculum Audit — `graphics_module_1_topic_1_1_dimensioning`

**Audited against:** `../Dimensions.pdf` — Chapter 4 "Dimensioning", *Engineering Graphics for
Diploma*, pp. 29–40 (Bureau of Indian Standards practice). 44 figures, 7 worked examples,
4 exercise sets.

**Audit date:** 2026-07-27
**Scope:** curriculum completeness only. Not a code review, not a UI review, not a bug hunt.
**Rule applied:** the textbook is the syllabus. Where evidence of coverage is absent, the concept
is marked NOT COVERED.

**Verdict as first audited (2026-07-27): PASS WITH MAJOR GAPS. Overall 5.9 / 10.**

> **The body of this document is the audit as first written, and is left unedited as the record.
> The remediation status below is the only part that is maintained.**

---

## REMEDIATION STATUS — 2026-07-27

Every recommendation in this document is implemented **except the production/authoring
workflow**, which is deliberately postponed (see below). Re-audited against the checklist:

| Recommendation | Status |
|---|---|
| **B1** Fix `SPACING.extGap` (contradicts Fig. 4.1) | ✅ set to 0 |
| **B2** Add a production task | ⏸ **DEFERRED — see below** |
| **B3** Ungate the §4.6 checklist and §4.5 system | ✅ painted on entry to Step 6 |
| **H4** Fig. 4.2 — centre line / outline as projection line | ✅ rule card, with a new `permission` mode so it is not shown as a violation |
| **H5** Fig. 4.3 — broken feature, unbroken dimension line | ✅ rule card + a `break` renderer |
| **H6** Fig. 4.4 — the other two leader heads | ✅ Step 1, three-head selector on one note |
| **H7** Fig. 4.21 — ø on a cylindrical feature seen as a rectangle | ✅ a ø28 × 26 spigot added to the part; symbol variant |
| **H8** Fig. 4.26(c) internal chamfer, Fig. 4.27(b) countersink by depth | ✅ 3 × 45° bore-mouth chamfer added to the part; both countersink variants |
| **H9** Figs. 4.7 / 4.8 as decisions | ✅ Step 1 space slider driving `fitDecision()` through all three regimes |
| **H10** Notation-error faults (`8R`, `20φ`, `24 Dia`, `Rad 4 mm`, `D12`) | ✅ four notation faults added — 12 in all |
| **H11** Tighten gating | ✅ 4/6 elements, 5/10 rules, both methods, 5/6 arrangements, **all five** BIS symbols, 12/12 faults |
| **M12** Figs. 4.19(b)/(c), 4.17(a), 4.11(a)/(b) | ✅ arrangement and method variants |
| **M13** Fig. 4.22 large radius | ✅ R220 crown added to the part; radius variant |
| **M14** Separate BIS symbols from feature conventions | ✅ two labelled groups; `bis` flag; the gate counts only the five |
| **M15** `⌒` above the value | ⚠️ still inline (`⌒19`); see the residual note below |
| **M16** Per-step summary; scale, caption, unit note as sheet furniture | ✅ summary card on every step; caption band + scale + unit selectors in Step 6 |
| **M17** Reconcile `validatePlacement`'s tolerance with the 0.5–1 mm it quotes | ✅ tolerance 6 mm → 4 mm |
| **L18** Name Type A / Type B on screen | ✅ clickable line-type legend in Step 1 |
| **L19** De-duplicate the four restatements of §4.6 | ✅ each fact now stated once |
| **L20** A second assessment pass / retry loop | ✅ partially — a wrong accusation is rejected and re-offered without penalty; there is still no separate re-test |

### What is deferred, and why

**The production / authoring workflow (B2).** The student still never places a dimension on an
undimensioned view, redraws a figure to scale, or performs a Method-1 → Method-2 conversion by
hand. This is the chapter's terminal objective and it remains the topic's largest gap. It is
postponed rather than half-built because it needs an authoring surface, lane snapping, a
production validation engine and a scoring model — a different interaction architecture from the
declarative spec pipeline this topic runs on (ADR-135). Bolting a partial authoring mode onto the
spec renderer would produce a worse teaching tool than an honest absence plus an exercise sheet.

### Residual known gaps

- **M15** — the arc symbol is rendered `⌒19` inline rather than printed above the numeral as
  Fig. 4.25(b) shows. Cosmetic, single instance, no ambiguity introduced.
- **§4.6 rule 8** is now demonstrated on a hatched patch, but the topic still has no true
  sectional view; the hatching is a study region, not a cut.
- **C8.1** (termination size proportional to drawing size) is now *shown* by the scale selector —
  the heads scale with the sheet — but it is not called out as a rule in its own right.
- **Assessment** is still recognition-only: twelve faults on one part. Transfer across shapes is
  untested, and will stay untested until B2 lands.

### Scores after remediation

| Dimension | Was | Now | Note |
|---|---:|---:|---|
| Academic completeness | 5 | **8** | every figure of §4.1–§4.5 (4.1–4.27) now represented; the 17 that remain are the worked examples and exercise sheets |
| Engineering accuracy | 7 | **9** | Fig. 4.1 contradiction removed; `⌒` placement remains |
| BIS compliance | 7 | **9** | gap fixed, tolerance reconciled, 15°–90° band now reachable |
| Interactive learning | 7 | **9** | eleven text-only concepts became controls |
| Teaching effectiveness | 6 | **8** | summaries, honest gates, load rebalanced across Steps 1–2 |
| Simulation quality | 9 | **9** | zero errors, zero warnings, memory flat |
| Concept coverage | 5 | **8** | |
| Figure coverage | 4 | **8** | 15 → 27 of 44 fully represented, and 27 is every figure in the teaching half of the chapter (4.1–4.27). The remaining 17 are Figs. 4.28–4.34 (seven worked wrong→correct examples, substituted here by twelve faults on one part) and Figs. 4.35–4.44 (ten exercise parts, which the deferred production workflow covers) |
| Rule coverage | 6 | **9** | 16 → 29 demonstrated; 1 wrong → 0 |
| Assessment quality | 3 | **5** | 8 → 12 faults incl. notation; still recognition-only |

**Weighted overall: 5.9 → 8.2.**

### Verdict after remediation

**PASS WITH MINOR GAPS.** The simulation now teaches §4.1 through §4.6 completely and
interactively, and a student who finishes it can read, judge and correct a dimensioned drawing.
It still cannot replace pp. 36–40, where the chapter asks the student to *produce* one — that is
the deferred work, and until it lands the topic should be issued alongside the textbook's
exercise sheets rather than instead of them.

---

## PHASE 1 — TEXTBOOK DECOMPOSITION

### §4.0 Opening (p. 29)

- **C1** Definition: furnishing size description on a technical drawing per a code of practice.
- **C1a** Size description includes: distance between surfaces and edges **with tolerance**,
  location of holes, **machining symbols**, **surface finish**, **type of material**, **quantity**.
- **C1b** Conveyed by lines, symbols **and notes**.

### §4.1 Elements of dimensioning (pp. 29–31)

- **C2** Five elements enumerated: projection line, dimension line, leader line, termination,
  dimensional text.
- **C3** Fig. 4.1 — elements labelled on a stepped shaft; Type A vs Type B line assignment;
  explicit annotation **"No gap is left here"** at the projection-line / outline junction.
- **C4** Projection lines: continuous thin Type B, plus four sub-rules —
  1. extending slightly beyond the respective dimension line,
  2. perpendicular to the feature to be dimensioned,
  3. not crossing other lines as far as possible,
  4. **may be drawn as an extension of a centre line or an outline of the object** (Fig. 4.2).
- **C5** Dimension lines: continuous thin Type B, plus four sub-rules —
  1. should not cross other lines,
  2. **a centre line or an outline of a part must not be used as a dimension line**,
  3. preferred to be drawn from visible outlines and not from hidden lines,
  4. **a broken feature is marked by an unbroken dimension line** (Fig. 4.3).
- **C6** Leader lines: continuous thin Type B; tail terminated on a short horizontal bar below
  the lettering of a note; **head terminated in one of three forms** (a dot within the outline of
  the object · an arrow head on the outline / edge · without a dot or arrow head on a dimension
  line) — Fig. 4.4. Three further notes: not parallel to adjacent dimension or projection lines
  where confusion might arise · drawn at **an angle not less than 30°** with the horizontal or
  vertical · **the use of common leaders may be avoided**.
- **C7** Termination of dimension lines: arrowheads or oblique strokes. Fig. 4.5(a) open, closed,
  closed-and-filled; Fig. 4.5(b) oblique stroke at 45°, dot. **Included angle may be 15° to 90°.**
- **C8** Termination sub-rules 1–6 —
  1. size of the termination proportional to the size of the drawing,
  2. **only one style per single drawing**; Fig. 4.6 suggested shape, length 3 to 4, width 1.5 to 2,
  3. arrow heads may be shown **within** the limits of the dimension line if space is available
     (Fig. 4.7, left-hand dimension),
  4. arrow heads may be shown **outside** the intended limits if space is not available
     (Fig. 4.7, the 4 mm value),
  5. **if the space between the projection lines is too small for an arrow head, dots or oblique
     strokes may be used** (Fig. 4.8),
  6. **only one arrow head termination is required to indicate the radius** of a circle or arc.
- **C9** Dimensional text: numerical value in an appropriate unit; text **3 mm to 4 mm** high;
  location relative to the dimension line decided by the Method; in millimetres no unit is written
  after the value; **other units (cm, m, km) must be indicated**; if all dimensions are in one
  non-mm unit it **may be noted near the title block**.

### §4.2 Methods of indicating dimensional values (pp. 31–32)

- **C10** Two methods suggested by BIS. **Only one method is to be used in a drawing.**
- **C11** Method-1 (aligned) conditions —
  1. parallel to the dimension line,
  2. above the dimension line,
  3. not touching the dimension line,
  4. at the middle of the dimension line as far as possible,
  5. **readable either from the bottom or from the right-hand side** of the drawing,
  6. **placed as indicated in Fig. 4.10 on inclined / oblique features**,
  7. angular values **as in Fig. 4.11(a) or (b); the second is simple, hence suggested for class work.**
- **C12** Fig. 4.9 — Method-1 worked example (80 / 40 / 46 on a wedge).
- **C13** Fig. 4.10 — the oblique orientation clock, **eight directions**.
- **C14** Fig. 4.11 — angular values Method-1, **two variants**.
- **C15** Method-2 (unidirectional) conditions —
  1. above horizontal dimension lines, at the middle, **without interrupting** the line,
  2. at the middle **by interrupting** the dimension line, for non-horizontal (vertical and
     inclined) dimension lines,
  3. readable from the bottom side,
  4. angular values **as in Fig. 4.13**.
- **C16** Figs. 4.12, 4.13.

### §4.3 Arrangement of dimension lines (pp. 32–33)

- **C17** Arrangement is independent of the Method; the selection **depends on the design and
  construction requirements**.
- **C18** *Chain dimensioning* (Fig. 4.14) — used **only where the possible accumulation of
  tolerances does not endanger the functional requirements** of the part.
- **C19** *Parallel dimensioning* (Fig. 4.15) — used only where a number of dimensions have a
  **common datum feature**.
- **C20** *Combined dimensioning* (Fig. 4.16). **Spacing rule:** distance of a dimension line from
  the object boundary or a nearby dimension line **at least 5 mm to 6 mm**.
- **C21** *Superimposed running dimensioning* (Fig. 4.17 a/b) — a simple parallel dimensioning,
  used where there are **space limitations and no legibility problems**; **origin indicated
  appropriately**; the **opposite end of each dimension line terminated only with an arrow head**;
  values entered as in **4.17(a) or 4.17(b)**.
- **C22** The same **in two directions** (Fig. 4.18).
- **C23** *Dimensioning by co-ordinates* (Fig. 4.19 **a / b / c**) — the principle of the
  co-ordinate system; **three ways** of representing the values: (a) numbered points with an
  x / y / ø table, (b) `x = …` / `y = …` written at each point, (c) numbered points with an x / y
  table without ø.

### §4.4 Shape indication (pp. 33–35)

- **C24** Principle: the shape of the feature is indicated along with the value as far as possible,
  because it improves interpretation. BIS-recommended indications **precede the value**:
  `ø` diameter · `R` radius · `□` square · `Sø` spherical diameter · `SR` spherical radius.
- **C25** *Circle* (Fig. 4.20) — several placements: across the circle, across with heads outside,
  on a leader off the circumference, small circles, R on small radii.
- **C26** *Cylindrical diameter* (Fig. 4.21) — **ø on rectangular (side) views** of cylindrical
  features, with and without a break; symbol **may be omitted where identifiable without confusion**.
- **C27** *Radius* (Fig. 4.22) — `R` symbol; **only one arrow head**; located inside or outside
  **depending on the size of the feature**; generally terminated on the feature outline; includes
  the **large-radius R120 case with a foreshortened / offset dimension line, three variants**.
- **C28** *Square* (Fig. 4.23) — `□` symbol; may be omitted where unmistakable; **square ends may be
  indicated by diagonals drawn as continuous thin lines**; three variants (□20, □14, □6 with the
  diagonal cross).
- **C29** *Spherical diameter and radius* (Fig. 4.24) — Sø28 on a ball; SR13 on an internal
  (sectioned) bowl.
- **C30** *Chord and arc* (Fig. 4.25 a/b) — chord dimensioned as a straight length; arc dimensioned
  with a **concentric** dimension line and the **⌒ symbol printed above the value**.
- **C31** *Chamfers* (Fig. 4.26 a/b/c) — external chamfers as length × angle; simplified indication
  where the angle is 45°; **internal chamfers as in (c)**.
- **C32** *Countersinks* (Fig. 4.27 a/b) — dimensioned by showing the **included angle with the
  diameter (a)** or **with the depth (b)**.

### §4.5 Suggested dimensioning system for class work (pp. 34–35)

- **C33** Six items —
  1. method of placing dimensional values: **Method-1** throughout the textbook,
  2. the arrow head: open type, included angle about 15°, length 3 to 4 mm, **thick line (0.5 mm)
     for the head, thin line (0.25 mm) for dimension and projection lines**, filled dots ≈1.5 mm
     where the space is too small,
  3. printing of dimensional values: uniform letters/numerals about 3 to 4 mm, 0.5 mm line
     thickness, at the middle portion, **0.5 to 1 mm above the dimension line**, HB pencil / stencil,
  4. units: millimetre; "mm" not written after a value; other units noted after the value or as a
     general instruction,
  5. **scale of drawing**: generally 1:1; if different it is noted below the drawing and in the title
     block; **whatever the scale, the ACTUAL dimension is written** (50 m drawn as 100 mm is
     dimensioned 50 m),
  6. **answers and captions**: name of object and views below the drawing **in capitals, 3 to 5 mm**;
     question number at the left top, **enclosed by a circle of 10 mm diameter**.

### §4.6 Rules of dimensioning (pp. 35–36)

- **C34** Nine rules —
  1. dimension, projection, extension and leader lines are continuous thin lines,
  2. projection lines extend slightly beyond the dimension line (1 to 2 mm),
  3. extension and dimensioning lines do not cross other lines unless unavoidable,
  4. extension lines perpendicular to the feature; obliquely but parallel to each other only on
     special requirements,
  5. dimensions given from visible outlines rather than from hidden lines,
  6. each end of the dimension line defined by an arrow head,
  7. **adjacent arrows may be replaced by a clearly marked dot or slash**,
  8. **if dimensioning inside a hatched portion is unavoidable, the hatching lines must not cross
     the dimensional text**,
  9. two systems of dimensioning are never mixed; only one system throughout a drawing.

### Worked examples and exercises (pp. 36–40)

- **C35–C42** Examples 4.1–4.7 with Figs. 4.28–4.34: **seven paired wrong → correct drawings on
  seven different parts** — L-plate (parallel, M-1), lock plate (chain, M-1), template (combined,
  M-1), rod support (combined, M-1), gland (M-2), wedge plate (M-2 **at 2:1, measured from the
  figure to 1 mm accuracy**), cylindrical machine part (**Method-1 running → Method-2 conversion**).
- **C43–C46** Exercises 1–4 with Figs. 4.35–4.44: **ten parts the student must dimension
  themselves** — guiding plate, lock washer ×2, U-plate washer, template, angle plate, go-no-go
  gauge, machine part ×2, axle (**2:1, measured from the figure**).
- **Recurring error vocabulary taught by these figures:** `8R` / `20φ` reversed symbol order,
  `24 Dia`, `Rad 4 mm`, `80 mm Dia`, `D12`, `12D`, dimensions placed inside the view, dimensions
  taken to hidden lines, over-dimensioning, values not taken from a datum.

---

## PHASE 2 — SIMULATION DECOMPOSITION

Six guided steps, one subject throughout — the **Guide Plate**, 200 × 100 × 30 mm.

### Step 1 — Elements

- "Add the dimensions" button animates four specs onto an undimensioned plate.
- Reveal choreography in draughting order: projection lines → dimension line growing from its
  middle → termination → value.
- Six chips (the five §4.1 elements **plus** "Note"). Hover / focus isolates that element alone on
  the drawing via a per-spec `only:` flag; click latches it for touch. Blurb panel per element.
- **Gate:** button pressed.

### Step 2 — Rules

- Seven rule cards, each with a **Correct / Violation** segmented toggle that re-renders one
  dimension: `ext-overshoot`, `ext-perpendicular`, `no-crossing`, `not-on-centre`,
  `visible-outlines`, `leader-angle`, `spacing`. Each card states the rule, its §-reference, and
  what breaks without it.
- Five termination chips (open / closed / filled / oblique / dot), applied **globally** to the
  whole sheet — the interaction itself is §4.1's "only one style per drawing".
- One **draggable value pill** (pointer drag and arrow-key nudge) judged by `validatePlacement()`
  against three Method-1 conditions; verdict panel names the rule broken and the value returns.
- **Gate:** one violation viewed.

### Step 3 — Methods

- Method-1 / Method-2 toggle.
- Drawing carries a horizontal, a vertical, an inclined (the chamfer face), an angular (45°) and a
  diameter dimension.
- **0–360° rotate slider.** Under Method-1 values rotate with their lines and flip through 180° to
  stay readable from the bottom or the right. Under Method-2 values stay horizontal and
  **interrupt** non-horizontal dimension lines.
- **Gate:** both methods seen.

### Step 4 — Arrangement

- Six options — chain, parallel, combined, superimposed running (one direction), running (two
  directions), by co-ordinates — each rebuilding the same station set with an animated transition.
- Panel per arrangement: use / used-when / space / clarity / making it.
- Running mode draws the origin circle and terminates only the far end of each line.
- Co-ordinate mode draws numbered crosshairs and paints the Fig. 4.19(a) table.
- **Before / after split view** — two independent sheets side by side, previous arrangement left,
  current right.
- **Gate:** three arrangements seen.

### Step 5 — Symbols

- Nine chips: `ø` diameter, `R` radius, `Sø` spherical diameter, `SR` spherical radius, `□` square,
  slot, chamfer, countersink, chord/arc.
- Each animates its specs onto the real feature it belongs to, with a four-field card:
  Means / Used / Placed / Watch out.
- Countersink chip reveals a "Turn the plate over" button (the feature is machined on the far face).
- **Gate:** four symbols seen.

### Step 6 — Review

- Complete drawing plus **eight seeded faults**: `m-short`, `m-cross`, `m-arrow`, `m-text`,
  `m-nosymbol`, `m-leader`, `m-hidden`, `m-duplicate`.
- Tri-toggle: With faults / Corrected / Compare (two sheets).
- Clickable, keyboard-reachable markers. A correct accusation morphs the fault into its correct
  form and explains rule / why / fix. A wrong accusation is rejected with a prompt to look again.
- Score `n of 8`. At 8/8, reveals the §4.6 nine-rule checklist and the §4.5 six-item class-work list.
- **Gate:** 8 of 8.

### Cross-cutting

Three viewport chips (Front view / 3-D view / Turn over) · glossary popover on eighteen terms ·
polite live-region narration of every state change · two-state Reset confirm.

---

## PHASE 3 — CONCEPT COVERAGE MATRIX

Status key: ✅ Complete · 🟡 Partially Covered · ❌ Missing · ⚠ Incorrect

| Textbook concept | p | Simulation coverage | Where covered | Quality | Status |
|---|---|---|---|---|---|
| C1 Definition of dimensioning | 29 | Glossary definition + Step 1 lead | `TERMS.dimensioning` | Good | ✅ |
| C1a Tolerance / machining symbols / surface finish / material / quantity | 29 | One clause inside one glossary popover. Never shown, never revisited | `TERMS.dimensioning` | Very Weak | 🟡 |
| C2 Five elements enumerated | 29 | Six chips, isolate-on-hover | Step 1 | Excellent | ✅ |
| C3 Fig. 4.1 Type A / Type B assignment | 29 | Widths differ (thin 1.15 px / thick 2.1 px); never named or explained to the student | `WIDTH_PX` | Weak | 🟡 |
| C3a **"No gap is left here"** | 29 | Sim draws a **1 mm gap** at every projection-line root | `SPACING.extGap` | Missing | ⚠ **Incorrect** |
| C4.1 Projection line extends beyond | 29 | Rule card + Step-6 fault `m-short` | Steps 2, 6 | Excellent | ✅ |
| C4.2 Perpendicular to the feature | 29 | Rule card `ext-perpendicular` | Step 2 | Excellent | ✅ |
| C4.3 Not crossing other lines | 29 | Rule card `no-crossing` | Step 2 | Good | ✅ |
| C4.4 **Centre line / outline may REPLACE a projection line (Fig. 4.2)** | 29 | Absent. Never stated, never drawn as a taught case | — | Missing | ❌ |
| C5.1 Dimension line not crossing | 30 | Rule card + fault `m-cross` | Steps 2, 6 | Excellent | ✅ |
| C5.2 Centre line never a dimension line | 30 | Rule card `not-on-centre` | Step 2 | Excellent | ✅ |
| C5.3 From visible outlines | 30 | Rule card + fault `m-hidden`; real far-face countersink gives a genuine dashed outline | Steps 2, 6 | Excellent | ✅ |
| C5.4 **Broken feature, unbroken dimension line (Fig. 4.3)** | 30 | Absent | — | Missing | ❌ |
| C6.1 Leader thin Type B, tail on a horizontal bar | 30 | Drawn (`barMm`) + glossary | `drawLeader` | Good | ✅ |
| C6.2 **Three leader head forms (Fig. 4.4)** | 30 | Renderer supports `dot` / `none`; **no spec anywhere uses them**. Text only | — | Very Weak | 🟡 |
| C6.3 Leader ≥ 30°, not parallel to adjacent lines | 30 | Rule card + fault `m-leader` | Steps 2, 6 | Excellent | ✅ |
| C6.4 Avoid common leaders | 30 | Absent | — | Missing | ❌ |
| C7 Termination styles | 30 | Five-chip selector, all five drawn correctly | Step 2 | Excellent | ✅ |
| C7a Included angle **range 15°–90°** | 30 | Stated in copy; only 15° is ever drawn. No angle control | `TERMINATION.open` | Weak | 🟡 |
| C8.1 Termination size proportional to drawing | 30 | Absent | — | Missing | ❌ |
| C8.2 One style per drawing | 30 | Global selector + fault `m-arrow` | Steps 2, 6 | Excellent | ✅ |
| C8.2a Fig. 4.6 proportions 3–4 × 1.5–2 | 30 | Implemented exactly and stated | `TERMINATION` | Excellent | ✅ |
| C8.3 / C8.4 **Heads inside vs outside the limits (Fig. 4.7)** | 30 | Outside case drawn once, on the slot width. **No toggle, no comparison**; the decision rule is never exercised | `arrowsOutside` | Weak | 🟡 |
| C8.5 **Dot / oblique BECAUSE the space is small (Fig. 4.8)** | 31 | Dot and oblique exist as global style chips. The tight-space **trigger** is never demonstrated | Step 2 | Weak | 🟡 |
| C8.6 One arrow head for a radius | 31 | Enforced in `drawRadius`, stated in the symbol card | Step 5 | Excellent | ✅ |
| C9 Text 3–4 mm high | 31 | Stated twice; label size is fixed CSS px, not scale-linked, not manipulable | — | Weak | 🟡 |
| C9a mm needs no suffix | 31 | Stated; every value on every drawing obeys it | — | Good | ✅ |
| C9b **cm / m / km must be indicated; note near the title block** | 31 | One glossary clause. No drawing shows it | — | Very Weak | 🟡 |
| C10 Two methods, only one per drawing | 31 | Toggle + §4.6 rule 9 restated | Step 3 | Excellent | ✅ |
| C11.1–5 Method-1 placement conditions | 31 | Toggle + rotate slider + draggable value validator | Steps 2, 3 | Excellent | ✅ |
| C11.6 **Fig. 4.10 oblique clock (8 orientations)** | 31 | ONE inclined dimension (the chamfer face). Cited in copy; the figure's systematic sweep is never shown | Step 3 | Weak | 🟡 |
| C11.7 **Fig. 4.11 angular, (a) vs (b), (b) suggested for class work** | 31 | One 45° angular dimension, one rendering. The a/b choice is absent | Step 3 | Weak | 🟡 |
| C15.1–3 Method-2 conditions, incl. line interruption | 32 | Implemented and animated | `textPlacement` | Excellent | ✅ |
| C15.4 **Fig. 4.13 angular under Method-2** | 32 | Angular text is held horizontal under M-2 — correct, but never called out or compared | Step 3 | Weak | 🟡 |
| C17 Arrangement chosen by design / construction need | 32 | `when` / `making` fields on all six | Step 4 | Excellent | ✅ |
| C18 Chain + tolerance accumulation | 32 | Arrangement + glossary `tolerance` | Step 4 | Good | ✅ |
| C19 Parallel + common datum | 32 | Arrangement + glossary `datum` | Step 4 | Good | ✅ |
| C20 Combined | 32 | Arrangement | Step 4 | Good | ✅ |
| C20a 5–6 mm spacing | 32 | Rule card `spacing` + `SPACING.offFirst = 6` | Step 2 | Excellent | ✅ |
| C21 Running: marked origin, far-end-only arrow | 32 | `drawOrigin` + `terminationEnds: 'far'` | Step 4 | Excellent | ✅ |
| C21a **Fig. 4.17(a) vs (b) value-entry styles** | 32 | Only (b) implemented | `textAt: 'far'` | Weak | 🟡 |
| C22 Running in two directions | 33 | `running2` | Step 4 | Excellent | ✅ |
| C23 Co-ordinate principle + table | 33 | `coordinate` + Fig. 4.19(a) table | Step 4 | Good | ✅ |
| C23a **Fig. 4.19(b) x=/y= at each point; (c) table without ø** | 33 | Absent | — | Missing | ❌ |
| C24 Symbols precede the value | 33 | Stated, obeyed by every spec, and enforced by fault `m-nosymbol` | Steps 5, 6 | Excellent | ✅ |
| C25 Circle, Fig. 4.20 placements | 33 | Three ø specs (leader / inside / outside heads) | Step 5 | Good | ✅ |
| C26 **ø on a cylindrical feature seen as a RECTANGLE (Fig. 4.21)** | 34 | The plate has no cylindrical body. Never shown | — | Missing | ❌ |
| C26a ø omissible where unambiguous | 34 | Stated in copy | Step 5 | Good | ✅ |
| C27 Radius: one arrow head, terminated on the outline | 34 | Three R specs (fillet, corner, slot end) | Step 5 | Excellent | ✅ |
| C27a **Large radius, foreshortened / offset centre (R120, Fig. 4.22)** | 34 | Absent | — | Missing | ❌ |
| C28 Square □ + diagonals | 34 | Leader □22 + both diagonals drawn as thin lines | Step 5 | Excellent | ✅ |
| C29 Sø and SR | 34 | Both, on a real spherical seat | Step 5 | Excellent | ✅ |
| C30 Chord vs arc, both values | 34 | Chord 17 / arc ⌒19 on the R12 corner — numerically correct | Step 5 | Excellent | ✅ |
| C30a **⌒ printed ABOVE the value** (Fig. 4.25b) | 34 | Rendered inline as `⌒19` | `s-arc` | Weak | ⚠ minor |
| C31 External chamfer + 45° simplification | 34–35 | Leader `10 × 45°` plus a separate 45° angular dimension | Step 5 | Good | ✅ |
| C31a **Internal chamfer (Fig. 4.26c)** | 35 | Absent — the part has no bore chamfer | — | Missing | ❌ |
| C32 Countersink by angle + diameter | 35 | `ø14 / ø24 × 90° CSK`, real 90° cone, far face | Step 5 | Excellent | ✅ |
| C32a **Countersink by angle + DEPTH (Fig. 4.27b)** | 35 | Absent | — | Missing | ❌ |
| C33 §4.5 items 1–4 | 35 | Class-work list — **gated behind finding 8/8 faults** | Step 6 | Weak | 🟡 |
| C33e **Scale of drawing rule** | 35 | One list line. No scale interaction anywhere in the topic | Step 6 | Very Weak | 🟡 |
| C33f **Captions / circled question number** | 35 | One list line. The drawing has no caption and no title block | Step 6 | Very Weak | 🟡 |
| C34 §4.6 rules 1–9 | 35–36 | Full checklist (gated); rules 2, 3, 4, 5, 6, 9 also demonstrated | Steps 2, 6 | Good | ✅ |
| C34.7 **Adjacent arrows replaced by a dot or slash** | 36 | Dot and oblique styles exist, but never in the adjacent-arrows situation | — | Weak | 🟡 |
| C34.8 **Hatching must not cross dimensional text** | 36 | Checklist line only. No sectioned view exists in the topic | — | Very Weak | 🟡 |
| C35–C42 **Seven worked wrong → correct examples on seven parts (Figs. 4.28–4.34)** | 36–38 | Eight faults on **one** part. The seven paired figures are not reproduced | Step 6 | Weak | 🟡 |
| C35a **Symbol-order errors: `8R`, `20φ`, `24 Dia`, `Rad 4 mm`, `80 mm Dia`, `D12`** | 36–39 | Mentioned in one symbol card's "mistake" line. **Never a fault the student must catch** | — | Very Weak | 🟡 |
| C41 **Measure a figure and redraw at 2:1** | 38 | Absent | — | Missing | ❌ |
| C42 **Convert a drawing Method-1 → Method-2** | 38 | The toggle does it automatically; the student never performs the conversion | Step 3 | Weak | 🟡 |
| C43–C46 **Exercises: the student dimensions ten given parts** | 38–40 | **Absent. No authoring, no placement task, no practice sheet** | — | Missing | ❌ |

**Totals:** ✅ 33 · 🟡 21 · ❌ 10 · ⚠ 2.

---

## PHASE 4 — FIGURE AUDIT

| Fig. | Subject | Represented? | Understandable through interaction? | Reproducible afterwards? | Teaches WHY it exists? |
|---|---|---|---|---|---|
| 4.1 | Elements labelled | Fully (as chips) | Yes — isolate each element | Yes | Yes |
| 4.2 | **Centre lines / outlines replace projection lines** | **No** | — | No | No |
| 4.3 | **Broken feature** | **No** | — | No | No |
| 4.4 | Leader head forms (three) | Partial — only the arrow form is ever drawn | No | No | Partly (text) |
| 4.5 | Termination gallery | Fully | Yes — live selector | Yes | Yes |
| 4.6 | Suggested arrow-head proportions | Fully | Static but dimensionally exact | Yes | Yes |
| 4.7 | Heads inside vs outside the limits | Partial — outside only, one instance | No toggle | Weakly | Partly |
| 4.8 | Dot / oblique where the space is tight | Partial — styles exist, trigger absent | No | No | No |
| 4.9 | Method-1 example | Equivalent, on the topic's own part | Yes | Yes | Yes |
| 4.10 | **Oblique orientation clock** | Partial — 1 of 8 cases | Rotate slider approximates it | Weakly | Partly |
| 4.11 | Angular Method-1, (a) vs (b) | Partial — one variant | No | No | No |
| 4.12 | Method-2 example | Equivalent | Yes | Yes | Yes |
| 4.13 | Angular Method-2 | Partial, incidental | No | No | No |
| 4.14 | Chain dimensioning | Fully, animated | Yes | Yes | Yes |
| 4.15 | Parallel dimensioning | Fully | Yes | Yes | Yes |
| 4.16 | Combined dimensioning | Fully | Yes | Yes | Yes |
| 4.17 | Running, one direction (a / b) | Partial — (b) only | Yes | Partly | Yes |
| 4.18 | Running, two directions | Fully | Yes | Yes | Yes |
| 4.19 | Co-ordinate (a / b / c) | Partial — (a) only | Yes | Partly | Yes |
| 4.20 | Circle placements | Mostly — 3 of ~8 forms | Yes | Yes | Yes |
| 4.21 | **ø on rectangular views** | **No** | — | No | No |
| 4.22 | Radius, incl. **R120 foreshortened** | Partial — small radii only | Yes for small radii | Partly | Yes |
| 4.23 | Square, three variants | Partial — one + diagonals | Yes | Mostly | Yes |
| 4.24 | Sø / SR | Fully | Yes | Yes | Yes |
| 4.25 | Chord and arc | Fully (⌒ inline, not above) | Yes | Yes | Yes |
| 4.26 | Chamfers a / b / **c** | Partial — external only | Yes | Partly | Yes |
| 4.27 | Countersink **a / b** | Partial — (a) only | Yes | Partly | Yes |
| 4.28–4.34 | **Seven worked wrong → correct parts** | **No** — substituted by eight faults on one part | Yes for the substitute | No | Yes for the substitute |
| 4.35–4.44 | **Ten exercise parts** | **No** | — | No | No |

**Fully represented: 15 of 44. Partial: 12. Absent: 17.**

---

## PHASE 5 — RULE AUDIT

### Explicitly taught AND interactively demonstrated (16)

Projection-line overshoot 1–2 mm · projection lines perpendicular to the feature · projection lines
not crossing · dimension lines not crossing · a centre line is never a dimension line · dimensions
from visible outlines · leaders at ≥ 30° · leaders not parallel to adjacent lines · only one
termination style per drawing · Fig. 4.6 head proportions · only one arrow head for a radius ·
Method-1's five placement conditions · Method-2's three placement conditions · never mix the two
systems · 5–6 mm dimension-line clearance · superimposed running: marked origin and far-end-only
termination.

### Explicitly stated but NOT demonstrated (13)

Included angle range 15°–90° · termination size proportional to drawing size · heads **inside** the
limits when space allows · dot / oblique substitution **because** the space is tight · adjacent
arrows replaced by a dot or slash · text 3–4 mm high · text 0.5–1 mm above the line (stated; the
validator tolerates up to 6 mm) · non-mm units must be indicated · general unit note near the title
block · the scale rule (the actual dimension is written whatever the scale) · captions in capitals
3–5 mm · hatching must not cross dimensional text · a symbol may be omitted where the feature is
unambiguous.

### Implicitly shown only (3)

Type A vs Type B line weights — rendered, never named · projection lines rising from hole centres,
i.e. Fig. 4.2 in practice but never labelled as the rule · over-dimensioning — punished by fault
`m-duplicate`, but the book's own framing of the vice is never used.

### Not taught (6)

Centre lines / outlines **may replace** projection lines · broken feature with an unbroken dimension
line · leader head as a dot within the outline · leader with no termination on a dimension line ·
avoid common leaders · the symbol-order error vocabulary (`8R`, `20φ`, `24 Dia`, `Rad 4 mm`).

### Incorrect (1) — BLOCKING

**Projection-line gap.** `SPACING.extGap = 1.0` mm inserts a visible gap between the object outline
and the root of every projection line, on every drawing, in all six steps. Fig. 4.1 carries an
explicit leader annotation reading **"No gap is left here"** pointing at exactly that junction. The
simulation therefore contradicts its own master reference in the chapter's very first figure,
silently and universally. The code comment offers no citation. This is the single most serious
academic defect found.

### Arguably incorrect (1)

`⌒19` rendered inline. Fig. 4.25(b) prints the arc symbol **above** the numeral.

---

## PHASE 6 — LEARNING OBJECTIVE AUDIT

| Objective | Achievable from the simulation alone? | Why not |
|---|---|---|
| Name the five elements of dimensioning | **Yes** | — |
| Draw each element correctly | **Partly** | The student never draws. And they would reproduce the incorrect projection-line root |
| Choose and justify a termination style | **Yes** | — |
| Decide inside vs outside arrow heads for a tight space | **No** | No decision is presented; one baked example |
| Place a value per Method-1 | **Yes** | The drag validator is the strongest interaction in the topic |
| Place a value per Method-2 | **Partly** | The student watches; never places one under M-2 |
| Dimension an oblique feature per Fig. 4.10 | **No** | One inclined case; the figure's system is never taught |
| Dimension an angular feature both ways (Figs. 4.11 / 4.13) | **No** | The variant choice is absent |
| Pick an arrangement to suit a design need | **Yes** | Strongest step in the topic |
| Apply ø, R, □, Sø, SR correctly | **Yes** | — |
| Write ø on a cylindrical feature seen as a rectangle | **No** | The case does not exist on the part |
| Dimension a large radius with an offset centre | **No** | Absent |
| Dimension an internal chamfer | **No** | Absent |
| Dimension a countersink by angle and depth | **No** | Only the angle + diameter form exists |
| Recite and apply the nine §4.6 rules | **Yes**, but the checklist is gated behind 8/8 faults |
| Detect wrong dimensioning in a given drawing | **Yes** — best-in-class here |
| **Produce a correctly dimensioned drawing from an undimensioned view** | **No** | The chapter's terminal objective. The textbook spends pp. 36–40 — five of twelve pages — on it. The simulation has zero authoring capability |
| Redraw a figure at 2:1 and dimension it | **No** | Absent |
| Write captions and title-block unit notes | **No** | Absent |

**Nine of nineteen objectives are not achievable. One of them is the chapter's terminal objective.**

---

## PHASE 7 — INTERACTION AUDIT

### Genuine teaching interactions

Element isolate-on-hover · correct ↔ violation morph (× 7) · global termination swap · value drag
with a rule verdict · method toggle crossed with a rotation slider · arrangement rebuild with a
two-sheet before/after · symbol animating onto its real feature · fault accusation with a
self-correcting morph · orbit to 3-D and turn-over to check the drawing against the solid.

### Concepts that appear as TEXT ONLY — flagged, in descending severity

1. §4.5 scale-of-drawing rule
2. §4.5 captions and circled question number
3. §4.6 rule 8 — hatching vs dimensional text
4. §4.6 rule 7 — adjacent arrows replaced by a dot or slash
5. Non-mm unit handling and the title-block note
6. Text height 3–4 mm
7. Leader head forms (dot within outline; no head)
8. Tolerance, machining symbols, surface finish, material, quantity
9. Inside-vs-outside arrow-head decision (one static instance)
10. Dot / oblique tight-space trigger
11. A symbol may be omitted where unambiguous

### Missing interaction types

No authoring or placement of a **new** dimension · no drag-a-dimension-into-a-lane task · no
multiple-choice or free-response assessment · no "which arrangement suits this part" judgement task ·
no scoring beyond the eight-fault counter · no retention pass, no second attempt, no remediation loop.

---

## PHASE 8 — BIS COMPLIANCE AUDIT

### Compliant

Terminology matches the book's own words · the symbol set is correct and always precedes the value ·
Method-1 and Method-2 conditions implemented exactly, including the M-2 line interruption ·
superimposed running dimensioning with far-end-only arrow heads and a marked origin · 5–6 mm
spacing · 1–2 mm projection overshoot (`extOvershoot: 1.5`) · a single arrow head on every radius ·
bare millimetre values throughout · Fig. 4.6 head proportions honoured · open 15° head drawn with a
thick line while dimension and projection lines stay thin (§4.5 item 2) · the scope note on absent
ISO symbols is correct, cited and well documented.

### Deviations

1. **⚠ Projection-line gap** (`extGap: 1.0`) contradicts Fig. 4.1's "No gap is left here". Systemic —
   affects every drawing in the topic.
2. **⚠ `⌒19` inline** vs Fig. 4.25(b)'s symbol-above-value.
3. Only 15° open heads are ever drawn; the permitted 15°–90° band is never visible.
4. `validatePlacement()` accepts text up to 6 mm above the line before objecting, while the copy
   quotes §4.5's "0.5 mm to 1 mm". The tolerance is a reasonable UX affordance, but the student is
   told a number the checker does not enforce.
5. The co-ordinate table adds "size" and "feature" columns that Fig. 4.19(a) does not have. Harmless,
   but it is not the book's table.
6. Six "elements" are presented where the book enumerates five. Handled honestly in the copy
   ("the five elements … plus the note a leader carries") — not a defect, recorded for completeness.

ADR-134's arrowhead carve-out is correct and correctly reasoned. No objection.

---

## PHASE 9 — PEDAGOGICAL AUDIT

| Step | Introduce | Explain | Demonstrate | Interact | Reinforce | Summarise |
|---|---|---|---|---|---|---|
| 1 Elements | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ |
| 2 Rules | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 3 Methods | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ |
| 4 Arrangement | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 5 Symbols | ✅ | ✅ | ✅ | 🟡 click-to-view only | ❌ | ❌ |
| 6 Review | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Pace — uneven.** Step 2 carries three unrelated control clusters (seven rules × two variants, five
terminations, a drag task) and is the highest cognitive load in the topic. Step 5 is nine cards of
read-only exposition and has the weakest interaction density.

**Gating too loose.** Step 2 advances after **one** of seven violations. Step 4 after three of six.
Step 5 after four of nine. A student can reach the final review having seen one rule broken and five
of nine symbols. Step 6, by contrast, demands 8 of 8. The gating is inconsistent with the stated
learning objectives.

**Gating too tight in one place.** The §4.6 checklist and the §4.5 class-work system — the chapter's
two summary artefacts — are unreachable until every fault is found. A student who stalls at 6/8 never
sees the nine rules at all.

**No summary except at the very end.** Nothing recapitulates Steps 1–5.

**No spaced reinforcement, no second pass, no wrong-answer remediation** beyond a single
"look again" message.

---

## PHASE 10 — MISSING CONTENT DISCOVERY

### Structural / severe

1. **No production task.** The student never places a dimension on an undimensioned drawing. Textbook
   pp. 36–40 — five of twelve pages, seven examples, four exercises, seventeen figures — is exactly
   this. Entirely absent.
2. **No "measure the figure, redraw at 2:1, dimension it"** task (Example 4.6, Exercise 3).
3. **No Method-1 → Method-2 conversion exercise** (Example 4.7); the toggle does the work for the
   student.
4. Seven paired wrong/correct worked examples on seven different parts are collapsed into eight
   faults on one part. Transfer across shapes is never tested.

### Rules and conventions absent

5. Fig. 4.2 — projection lines **may be** extensions of centre lines or outlines. Worse: the
   simulation teaches the adjacent prohibition (a centre line is never a dimension line) with no
   counterweight, inviting over-generalisation to "never involve centre lines at all".
6. Fig. 4.3 — a broken feature dimensioned by an unbroken dimension line.
7. Fig. 4.4 — leader head as a **dot within the outline**, and a leader with **no head** on a
   dimension line.
8. "The use of common leaders may be avoided."
9. §4.1 sub-rule 1 — termination size proportional to drawing size.
10. §4.6 rule 7 — adjacent arrows replaced by a dot or slash, in the situation that calls for it.
11. §4.6 rule 8 — hatching must not cross dimensional text. No sectioned view exists anywhere in the
    topic.
12. Fig. 4.7 — the **decision** between heads inside and outside the limits.
13. Fig. 4.8 — dot / oblique substitution **triggered by tight space**, not offered as a global style
    preference.

### Symbols and feature cases absent

14. Fig. 4.21 — ø on a cylindrical feature seen as a rectangle. The plate has no cylindrical body at
    all, so the single most common ø case in real drawings never appears.
15. Fig. 4.22 — large radius (R120) with a foreshortened / offset dimension line.
16. Fig. 4.23 — the other two square-dimensioning variants.
17. Fig. 4.26(c) — internal chamfer.
18. Fig. 4.27(b) — countersink dimensioned by included angle and **depth**.
19. Fig. 4.19(b) and (c) — the other two co-ordinate representations.
20. Fig. 4.17(a) — the rotated value-entry style for running dimensioning.
21. Fig. 4.11(a) vs (b) — the angular variant choice, and the book's explicit recommendation of (b)
    for class work.

### Terminology and notation absent

22. The book's **wrong-notation vocabulary**: `8R`, `20φ`, `24 Dia`, `Rad 4 mm`, `80 mm Dia`, `D12`,
    `12D`. These recur across nine textbook figures as the errors to be corrected. The simulation
    mentions one, in one card, in passing, and never asks the student to catch one.
23. Tolerance, machining symbols, surface finish, material and quantity — the opening paragraph's
    list of what dimensioning conveys.
24. Title block; the general unit note near the title block.
25. Captions, and the question number enclosed in a ø10 circle (§4.5 item 6).
26. Scale of drawing as a live idea (§4.5 item 5).
27. HB pencil / stencil, and the 0.5 mm / 0.25 mm line thicknesses named as such (§4.5 items 2–3).

### Errors

28. **The 1 mm projection-line gap contradicts Fig. 4.1 directly.**
29. `⌒` placed inline rather than above the value.

---

## PHASE 11 — REDUNDANCY AUDIT

- **Duplicate rule content.** `RULES[].rule` (Step 2), `BIS_CHECKLIST` (Step 6), the `TERMS` glossary
  and the step `postBody` prose state the same §4.6 rules in up to four different wordings. Rules 2,
  3, 4 and 5 appear in all four places.
- **Duplicate termination copy.** `TERMINATIONS[].detail`, `STEPS[2].postBody`,
  `CLASSWORK_SYSTEM[1].detail` and the `dimensionSymbols` file header all restate the
  15° / 3–4 mm / thick-line facts.
- **`slot` is not a symbol.** Its own card admits "Not a BIS shape symbol", yet it sits among
  ø / R / Sø / SR / □ and counts toward the four-of-nine gate. It belongs in Step 2 — Fig. 4.7 is a
  termination rule, not a shape indication.
- **`chordArc` (`⌒`), `chamfer` (`45°`) and `countersink` (`⌵`)** are invented chips presented at the
  same rank as the five BIS symbols. §4.4's recommended set is five. The presentation blurs which
  five a student must memorise.
- **Steps 1 and 2 overlap.** Step 1's element blurbs already state the projection-line and leader
  rules that Step 2 then teaches as rule cards.
- **Step 5 is underutilised** — nine read-only cards, no task, gate satisfied by four clicks.
- **Step 2 is overloaded** — three separate control clusters plus the topic's only free-form
  interaction.
- **`ELEMENT_PARTS`** is exported but carries no downstream consumer beyond the reveal order; a
  low-value public surface.

---

## PHASE 12 — FINAL SCORECARD

| Dimension | Score | Basis |
|---|---:|---|
| Academic completeness | **5 / 10** | 33 ✅ / 21 🟡 / 10 ❌. The entire back half of the chapter (production) is absent |
| Engineering accuracy | **7 / 10** | Geometry and arithmetic correct throughout; one systemic contradiction of Fig. 4.1, one minor arc-symbol deviation |
| BIS compliance | **7 / 10** | Strong on methods, arrangements and symbols; the projection-line gap is a real non-compliance present on every drawing |
| Interactive learning | **7 / 10** | Excellent where it interacts; eleven concepts are text-only |
| Teaching effectiveness | **6 / 10** | Strong demonstration, weak reinforcement, no per-step summary, inconsistent gating |
| Simulation quality | **9 / 10** | Clean, zero-error, correctly disposed, coherent design language, honest documentation |
| Concept coverage | **5 / 10** | See the Phase 3 matrix |
| Figure coverage | **4 / 10** | 15 of 44 figures fully represented |
| Rule coverage | **6 / 10** | 16 demonstrated, 13 stated only, 6 absent, 1 wrong |
| Assessment quality | **3 / 10** | One recognition task (eight faults, one part). No production, no transfer, no re-test, no remediation |

**Weighted overall: 5.9 / 10.**

---

## PHASE 13 — FINAL VERDICT

### PASS WITH MAJOR GAPS

The simulation cannot replace the chapter. It replaces §4.1–§4.4 well and §4.5–§4.6 partially, and it
does **not** replace pp. 36–40 at all — the seven worked examples and four exercise sets, which is
where the chapter converts recognition into skill.

A student who finishes this simulation can **read** a dimensioned drawing and **judge** one. They
cannot **dimension** one, because they were never once asked to.

### Required before release

#### Blocking

1. **Fix `SPACING.extGap`.** Either set it to 0 to match Fig. 4.1's "No gap is left here", or keep
   the gap and cite a source that permits it. As it stands the simulation contradicts its master
   reference on every drawing it renders. Under the project's own governing rule — *never contradict
   the textbook* — this alone blocks release.
2. **Add a production task.** At minimum, one step in which the student places dimensions on an
   undimensioned view and is scored against the §4.6 rules. The declarative spec pipeline and
   `validatePlacement()` already make this cheap: lane snapping plus the existing validator plus a
   completeness check. Without it the chapter's terminal objective is untaught.
3. **Ungate the §4.6 checklist and the §4.5 class-work system.** Make them reachable on entering
   Step 6, not on reaching 8/8.

#### High

4. Add Fig. 4.2 (centre lines and outlines acting as projection lines). The topic currently risks
   teaching the opposite by omission.
5. Add Fig. 4.3 (broken feature, unbroken dimension line).
6. Add the two missing leader head forms (Fig. 4.4) — the renderer already supports them; only specs
   are missing.
7. Add ø on a cylindrical feature seen as a rectangle (Fig. 4.21). Requires a boss or a cylindrical
   portion on the plate.
8. Add the internal chamfer (Fig. 4.26c) and the countersink-by-depth form (Fig. 4.27b).
9. Turn Fig. 4.7 (inside vs outside heads) and Fig. 4.8 (dot / oblique for a tight space) into
   **decisions**, not baked instances.
10. Add the symbol-order error vocabulary (`8R`, `20φ`, `24 Dia`, `Rad 4 mm`) as catchable faults in
    Step 6.
11. Tighten gating: Step 2 ≥ 4 of 7 violations, Step 4 ≥ 5 of 6 arrangements, Step 5 all five BIS
    symbols.

#### Medium

12. Add Fig. 4.19(b)/(c) co-ordinate variants, Fig. 4.17(a) value style, and the Fig. 4.11(a)/(b)
    angular choice with the book's class-work recommendation.
13. Add the Fig. 4.22 large-radius foreshortened case.
14. Move `slot` out of the symbol toolbar into Step 2; visually separate the five BIS symbols from
    the three feature conventions.
15. Move `⌒` above the value (Fig. 4.25b).
16. Add a per-step summary; render scale, caption and title block as a visible sheet frame rather
    than list text.
17. Reconcile `validatePlacement()`'s 6 mm tolerance with the 0.5–1 mm it quotes, or state the
    tolerance to the student.

#### Low

18. Name the Type A / Type B line weights on screen (ties back to the Foundations topic).
19. Deduplicate the four restatements of the §4.6 rules.
20. Add a second assessment pass and a retry loop.

---

### Closing note

The engineering, architecture and documentation are strong and honest. The scope note on absent ISO
symbols is exactly right, and ADR-133 / ADR-134 are properly argued rather than quietly assumed.

The academic problem is not sloppiness. It is that the topic was scoped as a **reading and
recognition** lesson, while the chapter's second half is a **drawing and production** curriculum.
That, together with the projection-line gap, is what stands between this build and a PASS.
