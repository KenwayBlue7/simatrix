# Changelog — Regular Polygons (graphics_diploma_module_1_topic_1_4_regular_polygons)

Per-module changelog, per this repo's own rule (root `CHANGELOG.md` header, `RULES.md` §8.2).
Root `CHANGELOG.md` covers repo-wide entries; this file covers only this module.

## 2026-08-08

- Fixed: the n-gon "Semicircle Division" method (`src/constructions.js`,
  `buildSemicircleDivision()`) was centred on the wrong vertex. `polygon.pdf` (the authoritative
  source for this topic) centres the semicircle on **A**, extends AB past A to a point C, and
  draws a ray from A through EVERY division point, extended past the arc, each cut by a
  radius-AB arc centred on the previously-found vertex — a distinct construction step per
  division ("Draw a line connecting A and [division]", repeated for 1, 2, 3…), independently
  deriving every vertex past B. The method as it shipped instead followed *Regular Polygons.pdf*
  Fig 5.23's mirrored variant (semicircle centred on B, point P past B), drew only ONE segment
  (division 2 to vertex C) with no ray and no real arc-cut, and fell back to a decorative
  compass-arc mark (drawn at an already-known closed-form vertex, cutting nothing) for every
  vertex after that. Rebuilt A-centred to match `polygon.pdf`: extension point C left of A,
  divisions numbered from B, a ray from A through each division (fixed +4 unit overshoot past
  whatever it needs to reach, not proportional — an earlier proportional overshoot pushed ray
  tips off the top of the canvas for long near-diameter chords around n=9–12), and a real
  arc-cut deriving every vertex D onward. Vertex letters shift to skip C (`A, B, D, E, F…`).
  Verified exact (floating-point noise) against the shared closed-form vertices
  (`regularPolygonVertices`) for n=3–12 at side 25/32/42 — every ray genuinely passes through the
  vertex it claims to cut (inscribed-angle exact for any n: the angle a ray through division `j`
  makes at A is always `j` division-steps, the same inscribed angle vertex `j+1` subtends there).
  Bounds-checked against the 200×140 viewBox across the same sweep (no clipping beyond the
  ~1-1.4 unit tolerance the perpendicular-bisector method's shared scale formula already carries).
  Verified live in Chrome (real foreground tab, not headless): full Play animation frame-by-frame
  for n=6 and n=12, Verify step's result text and "why it works" copy, Reset, method switching,
  pentagon/hexagon regression check, zero console errors throughout.

  A previous pass had rebuilt this method already (see root `CHANGELOG.md` 2026-08-08, and
  `DECISIONS.md` ADR-143) but centred it wrong and additionally recorded — in ADR-143, this
  file's own header comment, and the root changelog — that a ray-cut derivation for every vertex
  was "numerically DISPROVED for n≥7". That claim was false (a ray-origin bug, not a geometric
  limit) and has been corrected in all three places by this pass.

- Fixed: `renderConstruction.js`'s point-label placement had no collision avoidance at all — a
  single unconditional `+4/-4` offset for every label, regardless of how many other points or
  labels were nearby. This was always latent (division numbers and vertex letters at higher n
  already crowd close together) and was made structurally worse by the semicircle-division fix
  above, which adds `n-1` more labelled points per construction; it also included a collision the
  new rays didn't cause — a division-number label and a vertex label landing at the exact same
  coordinate (the semicircle-division method's second division point coincides exactly with the
  vertex it derives), which no single fixed offset can resolve for both. Replaced with a greedy
  candidate-search placement pass (`assignLabelPositions()`) — tries a ring of candidate offsets
  around each labelled point, in order starting from a hint direction, picks the first that
  doesn't overlap an already-placed label or any marker dot — run once per recipe, before either
  `renderStatic()` or `playSteps()`, so a label's position is decided up front and never jumps
  mid-animation. `constructions.js`'s `P()` step builder gained an optional radial-outward offset
  hint (`awayFrom()`) — the semicircle-division method's division numbers now hint outward from
  the semicircle's own centre, and its derived vertex letters hint outward from the circumcentre,
  giving the greedy search an already-likely-clear starting candidate. Verified live in Chrome at
  n=6 (clean) and n=12/side=42 (the worst-case density this sim allows) — resolves the exact-
  coincidence case and the general n=12 crush; one residual light overlap remains among the very
  densest division labels at that single most extreme corner. Also checked for regression on
  pentagon, hexagon, and the perpendicular-bisector method (all share the same render path) — no
  regression, and the bisector method's own previously-crowded ladder labels (4/5/6/7…) benefit
  from the same generic pass despite not having been given explicit radial hints.

- Added: this file. The module had no `CHANGELOG.md` of its own — only root `CHANGELOG.md` had
  been carrying this module's history, against this repo's own per-module-changelog rule
  (root `CHANGELOG.md` header, `RULES.md` §8.2).
